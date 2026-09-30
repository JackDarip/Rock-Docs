"use server";

import { revalidatePath } from "next/cache";
import { requireCtx } from "@/lib/auth";
import { enqueue } from "@/lib/jobs";
import { aiEnabled, assertAiBudget, estimateAiCost } from "@/lib/ai";
import { parseScheduleFile } from "@/lib/schedule";
import { diffSchedule } from "@/lib/addenda";
import { regenerateMaterialList } from "@/lib/estimate";
import { generateRfqs } from "./rfq";

async function addendum(documentId: string) {
  const ctx = await requireCtx();
  const doc = await ctx.db.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error("Addendum not found");
  return { ...ctx, doc };
}

export async function importAddendumSchedule(documentId: string, formData: FormData) {
  const { db, doc, user } = await addendum(documentId);
  const file = formData.get("file") as File | null;
  if (!file?.size) return { ok: false as const, error: "Choose the revised bid schedule (Excel or CSV)" };
  const parsed = await parseScheduleFile(Buffer.from(await file.arrayBuffer()), file.name);
  if (!parsed.ok) return parsed;
  const n = await diffSchedule(db, doc.projectId, doc.id, parsed.rows, user.id);
  revalidatePath(`/projects/${doc.projectId}`, "layout");
  return { ok: true as const, changes: n };
}

export async function runAddendumExtraction(documentId: string) {
  const { company, doc } = await addendum(documentId);
  if (!aiEnabled()) return { ok: false as const, error: "AI reading isn't configured on this server yet. Import the revised schedule from Excel/CSV instead." };
  try { await assertAiBudget(company.id, estimateAiCost(doc.pageCount || 1).usd); } catch (e: any) { return { ok: false as const, error: e.message }; }
  await enqueue(company.id, "EXTRACT_ADDENDUM", { documentId });
  revalidatePath(`/projects/${doc.projectId}/addenda`);
  return { ok: true as const };
}

async function finishIfDone(db: Awaited<ReturnType<typeof requireCtx>>["db"], documentId: string, projectId: string, userId: string) {
  if (await db.bidItemChange.count({ where: { documentId, status: "PENDING" } })) return;
  const decided = await db.bidItemChange.findMany({ where: { documentId } });
  if (!decided.length) return;
  const doc = await db.document.findUnique({ where: { id: documentId } });
  const items = await db.bidItem.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" } });
  const acc = decided.filter((c) => c.status === "ACCEPTED");
  const sheets = await db.sheet.count({ where: { documentId } });
  await db.packageVersion.create({
    data: {
      projectId, documentId, userId, label: `Addendum ${doc?.addendumNumber ?? "?"}`,
      summary: { added: acc.filter((c) => c.changeType === "ADDED").length, changed: acc.filter((c) => c.changeType === "CHANGED").length, removed: acc.filter((c) => c.changeType === "REMOVED").length, rejected: decided.length - acc.length, sheets } as any,
      snapshot: items.map((b) => ({ itemNumber: b.itemNumber, description: b.description, unit: b.unit, quantity: b.quantity, specSection: b.specSection })) as any,
    } as any,
  });
  if (acc.length) await regenerateMaterialList(db, projectId);
}

/** Accept (optionally edited) or reject one change. Accepted changes update the bid items. */
export async function decideChange(id: string, accept: boolean) {
  const { db, user } = await requireCtx();
  const c = await db.bidItemChange.findUnique({ where: { id } });
  if (!c || c.status !== "PENDING") return { ok: false as const, error: "Already decided" };
  const doc = await db.document.findUnique({ where: { id: c.documentId } });
  const tag = `Addendum ${doc?.addendumNumber ?? ""}`.trim();
  if (accept) {
    const a = c.after as any;
    if (c.changeType === "ADDED") {
      const n = await db.bidItem.count({ where: { projectId: c.projectId } });
      await db.bidItem.create({ data: { projectId: c.projectId, itemNumber: a.itemNumber, description: a.description, unit: a.unit, quantity: a.quantity, specSection: a.specSection, source: "BID_SCHEDULE", sourceNote: `Added by ${tag}`, documentId: c.documentId, status: "CONFIRMED", confirmedById: user.id, confirmedAt: new Date(), sortOrder: n } as any });
    } else if (c.changeType === "CHANGED" && c.bidItemId) {
      await db.bidItem.update({ where: { id: c.bidItemId }, data: { description: a.description, unit: a.unit, quantity: a.quantity, ...(a.specSection ? { specSection: a.specSection } : {}), sourceNote: `Revised by ${tag}`, documentId: c.documentId, confirmedById: user.id, confirmedAt: new Date() } });
    } else if (c.changeType === "REMOVED" && c.bidItemId) {
      await db.bidItemAssembly.deleteMany({ where: { bidItemId: c.bidItemId } });
      await db.bidItem.delete({ where: { id: c.bidItemId } }).catch(() => {});
    }
  }
  await db.bidItemChange.update({ where: { id }, data: { status: accept ? "ACCEPTED" : "REJECTED", decidedById: user.id, decidedAt: new Date() } });
  await finishIfDone(db, c.documentId, c.projectId, user.id);
  revalidatePath(`/projects/${c.projectId}`, "layout");
  return { ok: true as const };
}

export async function acceptAllChanges(documentId: string) {
  const { db } = await requireCtx();
  const pending = await db.bidItemChange.findMany({ where: { documentId, status: "PENDING" }, orderBy: { createdAt: "asc" } });
  for (const c of pending) await decideChange(c.id, true);
  return { ok: true as const, count: pending.length };
}

export async function reviseAffectedRfqs(projectId: string) {
  return generateRfqs(projectId);
}
