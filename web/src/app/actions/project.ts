"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseScheduleFile } from "@/lib/schedule";
import { requireCtx } from "@/lib/auth";
import { enqueue } from "@/lib/jobs";
import { estimateAiCost, assertAiBudget, aiEnabled } from "@/lib/ai";
import { loadEstimate, regenerateMaterialList } from "@/lib/estimate";
import { similarity } from "@/lib/rfq";

async function projectOr404(projectId: string) {
  const ctx = await requireCtx();
  const project = await ctx.db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Bid not found");
  return { ...ctx, project };
}

// ---------- Project ----------

export async function createProject(formData: FormData) {
  const { db, company, user } = await requireCtx();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const c = await prisma.company.update({ where: { id: company.id }, data: { jobCounter: { increment: 1 } } });
  const jobNumber = String(formData.get("jobNumber") ?? "").trim() || String(c.jobCounter).padStart(4, "0");
  const date = (k: string) => { const v = String(formData.get(k) ?? ""); return v ? new Date(v) : null; };
  const p = await db.project.create({
    data: {
      name, jobNumber, owner: (formData.get("owner") as string) || null, ownerType: (formData.get("ownerType") as string) || null,
      projectNumber: (formData.get("projectNumber") as string) || null, location: (formData.get("location") as string) || null,
      bidDueAt: date("bidDueAt"), estimatorId: user.id,
      laborMode: ["FEDERAL", "STATE_DOT", "COUNTY_CITY"].includes(String(formData.get("ownerType"))) ? "PREVAILING" : "OPEN",
    } as any,
  });
  redirect(`/projects/${p.id}`);
}

const projectFields = z.object({
  name: z.string().min(1), owner: z.string().nullable(), ownerType: z.string().nullable(), projectNumber: z.string().nullable(),
  location: z.string().nullable(), bidDueAt: z.coerce.date().nullable(), quoteDueAt: z.coerce.date().nullable(),
  preBidMeeting: z.string().nullable(), deliveryLocation: z.string().nullable(), laborMode: z.enum(["OPEN", "PREVAILING"]),
  markupPct: z.number().nullable(), overheadPct: z.number().nullable(), taxPct: z.number().nullable(), bondPct: z.number().nullable(),
  haulMiles: z.number().nullable(), permitsCost: z.number().nullable(), notes: z.string().nullable(), status: z.string(),
}).partial();

export async function updateProject(projectId: string, field: string, value: unknown) {
  const { db } = await projectOr404(projectId);
  const parsed = projectFields.safeParse({ [field]: value === "" ? null : value });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  await db.project.update({ where: { id: projectId }, data: parsed.data });
  revalidatePath(`/projects/${projectId}`, "layout");
  return { ok: true };
}

// ---------- Documents ----------

export async function setDocumentKind(documentId: string, kind: string, addendumNumber?: number | null) {
  const { db } = await requireCtx();
  const doc = await db.document.update({ where: { id: documentId }, data: { kind, kindConfirmed: true, addendumNumber: kind === "ADDENDUM" ? addendumNumber ?? null : null } });
  revalidatePath(`/projects/${doc.projectId}`, "layout");
}

export async function acknowledgeAddendum(documentId: string, acknowledged: boolean) {
  const { db } = await requireCtx();
  const doc = await db.document.update({ where: { id: documentId }, data: { acknowledged, acknowledgedAt: acknowledged ? new Date() : null } });
  revalidatePath(`/projects/${doc.projectId}`, "layout");
}

export async function deleteDocument(documentId: string) {
  const { db } = await requireCtx();
  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc) return;
  await db.sheet.deleteMany({ where: { documentId } });
  await db.takeoffMarkup.deleteMany({ where: { documentId } });
  await db.document.delete({ where: { id: documentId } });
  revalidatePath(`/projects/${doc.projectId}`, "layout");
}

export async function updateSheet(sheetId: string, data: { sheetNumber?: string | null; title?: string | null; classification?: string | null }) {
  const { db } = await requireCtx();
  await db.sheet.update({ where: { id: sheetId }, data: { ...data, ...(data.classification !== undefined ? { classConfirmed: true } : {}) } });
}

export async function aiCostPreview(documentId: string, pages: number[] | null) {
  const { db, company } = await requireCtx();
  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc) return null;
  const n = pages?.length || doc.pageCount || 1;
  return { ...estimateAiCost(n), pages: n, enabled: aiEnabled(), limit: company.aiMonthlyLimitUsd };
}

export async function runBidScheduleExtraction(documentId: string, pages: number[] | null) {
  const { db, company } = await requireCtx();
  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc) return { ok: false, error: "Document not found" };
  if (!aiEnabled()) return { ok: false, error: "AI extraction isn't configured on this server yet. Import the bid schedule from Excel/CSV or enter it by hand." };
  try { await assertAiBudget(company.id, estimateAiCost(pages?.length || doc.pageCount || 1).usd); }
  catch (e: any) { return { ok: false, error: e.message }; }
  await enqueue(company.id, "EXTRACT_BID_SCHEDULE", { documentId, pages: pages ?? undefined });
  revalidatePath(`/projects/${doc.projectId}`, "layout");
  return { ok: true };
}

// ---------- Bid items ----------

export async function importBidSchedule(projectId: string, formData: FormData) {
  const { db } = await projectOr404(projectId);
  const file = formData.get("file") as File | null;
  if (!file?.size) return { ok: false, error: "Choose a file" };
  const parsed = await parseScheduleFile(Buffer.from(await file.arrayBuffer()), file.name);
  if (!parsed.ok) return parsed;
  const existing = await db.bidItem.count({ where: { projectId } });
  const data = parsed.rows.map((r, i) => ({
    projectId, itemNumber: r.itemNumber, description: r.description, unit: r.unit, quantity: r.quantity,
    specSection: r.specSection, source: "BID_SCHEDULE", sourceNote: `Imported from ${file.name}`,
    status: "DRAFT", confidence: "HIGH", sortOrder: existing + i,
  }));
  await db.bidItem.createMany({ data: data as any });
  revalidatePath(`/projects/${projectId}`, "layout");
  return { ok: true, count: data.length };
}

export async function confirmBidItems(projectId: string, ids: string[]) {
  const { db, user } = await projectOr404(projectId);
  await db.bidItem.updateMany({ where: { projectId, id: { in: ids } }, data: { status: "CONFIRMED", confirmedById: user.id, confirmedAt: new Date() } });
  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function unconfirmBidItem(projectId: string, id: string) {
  const { db } = await projectOr404(projectId);
  await db.bidItem.updateMany({ where: { projectId, id }, data: { status: "DRAFT" } });
  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function applyTakeoffQuantity(projectId: string, bidItemId: string, qty: number) {
  const { db, user } = await projectOr404(projectId);
  await db.bidItem.updateMany({
    where: { projectId, id: bidItemId },
    data: { quantity: qty, source: "MANUAL", sourceNote: "From your takeoff markups", status: "CONFIRMED", confirmedById: user.id, confirmedAt: new Date(), aiExtracted: false, confidence: "HIGH" },
  });
  revalidatePath(`/projects/${projectId}`, "layout");
}

// ---------- Takeoff ----------

const markupSchema = z.object({
  documentId: z.string(), pageIndex: z.number().int().min(0), bidItemId: z.string().nullable(),
  tool: z.enum(["LINEAR", "POLYLINE", "AREA", "COUNT"]), points: z.array(z.tuple([z.number(), z.number()])).min(1),
  quantity: z.number(), unit: z.string(), color: z.string(), label: z.string().nullable(),
});

export async function saveMarkup(projectId: string, data: unknown) {
  const { db, user } = await projectOr404(projectId);
  const d = markupSchema.parse(data);
  if (!(await db.document.findFirst({ where: { id: d.documentId, projectId } }))) throw new Error("Document not in this bid");
  if (d.bidItemId && !(await db.bidItem.findFirst({ where: { id: d.bidItemId, projectId } }))) throw new Error("Bid item not in this bid");
  const m = await db.takeoffMarkup.create({ data: { ...d, projectId, createdById: user.id } as any });
  return JSON.parse(JSON.stringify(m));
}

export async function deleteMarkup(projectId: string, id: string) {
  const { db } = await projectOr404(projectId);
  await db.takeoffMarkup.deleteMany({ where: { id, projectId } });
}

export async function calibrateSheet(projectId: string, documentId: string, pageIndex: number, feetPerUnit: number) {
  const { db, user } = await projectOr404(projectId);
  const doc = await db.document.findFirst({ where: { id: documentId, projectId } });
  if (!doc || !(feetPerUnit > 0)) throw new Error("Invalid calibration");
  const existing = await db.sheet.findFirst({ where: { documentId, pageIndex } });
  if (existing) await db.sheet.update({ where: { id: existing.id }, data: { feetPerUnit, calibratedById: user.id } });
  else await db.sheet.create({ data: { documentId, projectId, pageIndex, feetPerUnit, calibratedById: user.id } as any });
}

// ---------- Mapping & overrides ----------

export async function addMapping(projectId: string, bidItemId: string, assemblyId: string) {
  const { db } = await projectOr404(projectId);
  if (!(await db.bidItem.findFirst({ where: { id: bidItemId, projectId } })) || !(await db.assembly.findUnique({ where: { id: assemblyId } }))) return;
  await db.bidItemAssembly.create({ data: { projectId, bidItemId, assemblyId, confirmed: true } as any });
  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function updateMapping(projectId: string, id: string, patch: { qtyFactor?: number; confirmed?: boolean }) {
  const { db } = await projectOr404(projectId);
  await db.bidItemAssembly.updateMany({ where: { id, projectId }, data: patch });
  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function removeMapping(projectId: string, id: string) {
  const { db } = await projectOr404(projectId);
  await db.bidItemAssembly.deleteMany({ where: { id, projectId } });
  revalidatePath(`/projects/${projectId}`, "layout");
}

/** Suggest assemblies for unmapped bid items by matching words and units. Suggestions need confirmation. */
export async function suggestMappings(projectId: string) {
  const { db } = await projectOr404(projectId);
  const [items, maps, asms] = await Promise.all([
    db.bidItem.findMany({ where: { projectId } }), db.bidItemAssembly.findMany({ where: { projectId } }), db.assembly.findMany(),
  ]);
  let n = 0;
  for (const bi of items) {
    if (maps.some((m) => m.bidItemId === bi.id)) continue;
    const best = asms
      .map((a) => ({ a, s: similarity(bi.description, `${a.name} ${a.description ?? ""}`) + (a.unit.toUpperCase() === bi.unit.toUpperCase() ? 0.15 : 0) }))
      .sort((x, y) => y.s - x.s)[0];
    if (best && best.s >= 0.35) {
      await db.bidItemAssembly.create({ data: { projectId, bidItemId: bi.id, assemblyId: best.a.id, confirmed: false, aiSuggested: true } as any });
      n++;
    }
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  return n;
}

export async function setOverride(projectId: string, targetType: string, targetId: string, field: string, value: number | null, reason: string | null) {
  const { db, user } = await projectOr404(projectId);
  if (value == null) {
    await db.jobOverride.deleteMany({ where: { projectId, targetType, targetId, field } });
  } else {
    const where = { projectId_targetType_targetId_field: { projectId, targetType, targetId, field } };
    await db.jobOverride.upsert({ where, create: { projectId, targetType, targetId, field, value, reason, userId: user.id } as any, update: { value, reason, userId: user.id } });
  }
  await db.auditLog.create({ data: { userId: user.id, action: "override", target: `${targetType}:${targetId}.${field}`, detail: { projectId, value, reason } } as any });
  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function saveEstimateVersion(projectId: string, label: string | null) {
  const { db, company, user } = await projectOr404(projectId);
  const est = await loadEstimate(db, company, projectId);
  if (!est) return;
  const last = await db.estimateVersion.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
  await db.estimateVersion.create({
    data: { projectId, version: (last?.version ?? 0) + 1, label, total: est.result.totals.total, userId: user.id, snapshot: JSON.parse(JSON.stringify(est.result)) } as any,
  });
  revalidatePath(`/projects/${projectId}/estimate`);
}

export async function duplicateProject(projectId: string) {
  const { db, company, project } = await projectOr404(projectId);
  const c = await prisma.company.update({ where: { id: company.id }, data: { jobCounter: { increment: 1 } } });
  const { id: _id, companyId: _c, createdAt: _a, updatedAt: _u, ...rest } = project;
  const copy = await db.project.create({ data: { ...rest, name: `${project.name} (copy)`, jobNumber: String(c.jobCounter).padStart(4, "0") } as any });
  const items = await db.bidItem.findMany({ where: { projectId } });
  const maps = await db.bidItemAssembly.findMany({ where: { projectId } });
  for (const bi of items) {
    const { id, companyId: _cc, createdAt: _ca, ...b } = bi;
    const nb = await db.bidItem.create({ data: { ...b, projectId: copy.id } as any });
    for (const m of maps.filter((x) => x.bidItemId === id)) {
      await db.bidItemAssembly.create({ data: { projectId: copy.id, bidItemId: nb.id, assemblyId: m.assemblyId, qtyFactor: m.qtyFactor, confirmed: m.confirmed } as any });
    }
  }
  const ovs = await db.jobOverride.findMany({ where: { projectId } });
  for (const o of ovs) await db.jobOverride.create({ data: { projectId: copy.id, targetType: o.targetType, targetId: o.targetId, field: o.field, value: o.value, reason: o.reason } as any });
  redirect(`/projects/${copy.id}`);
}

// ---------- Material list ----------

export async function rebuildMaterialList(projectId: string) {
  const { db } = await projectOr404(projectId);
  const r = await regenerateMaterialList(db, projectId);
  revalidatePath(`/projects/${projectId}`, "layout");
  return r;
}
