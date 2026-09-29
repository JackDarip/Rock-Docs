"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCtx, requireAdminCtx } from "@/lib/auth";
import { enqueue } from "@/lib/jobs";
import { newKey, putScanned } from "@/lib/storage";
import { aiEnabled, assertAiBudget, estimateAiCost } from "@/lib/ai";
import { calibrate } from "@/lib/calibrate";
import { loadEstimate } from "@/lib/estimate";

const str = (v: FormDataEntryValue | null) => (v == null ? "" : String(v).trim());

export async function createJob(formData: FormData) {
  const { db, user } = await requireCtx();
  const name = str(formData.get("name"));
  if (!name) return;
  const done = str(formData.get("completedAt"));
  const j = await db.historicalJob.create({ data: { name, jobNumber: str(formData.get("jobNumber")) || null, completedAt: done ? new Date(done) : null, createdById: user.id } as any });
  redirect(`/jobs/${j.id}`);
}

export async function deleteJob(id: string) {
  const { db } = await requireCtx();
  await db.jobCostLine.deleteMany({ where: { jobId: id } });
  await db.jobCostFile.deleteMany({ where: { jobId: id } });
  await db.historicalJob.deleteMany({ where: { id } });
  redirect("/jobs");
}

export async function uploadJobFiles(jobId: string, formData: FormData) {
  const { db, company } = await requireCtx();
  const job = await db.historicalJob.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false as const, error: "Job not found" };
  const role = z.enum(["ESTIMATE", "ACTUAL", "OTHER"]).catch("ACTUAL").parse(formData.get("role"));
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false as const, error: "Choose one or more files" };
  const results: string[] = [];
  for (const f of files) {
    if (!/\.(pdf|xlsx|csv|png|jpe?g)$/i.test(f.name)) { results.push(`${f.name}: use PDF, Excel, CSV or a photo (PNG/JPG)`); continue; }
    if (f.size > 100e6) { results.push(`${f.name}: over 100 MB`); continue; }
    const buf = Buffer.from(await f.arrayBuffer());
    const key = newKey(company.id, `jobs/${jobId}`, f.name);
    let scan;
    try { scan = await putScanned(company.id, key, buf); } catch (e) { results.push(`${f.name}: ${e instanceof Error ? e.message : "refused"}`); continue; }
    const file = await db.jobCostFile.create({ data: { jobId, filename: f.name, storageKey: key, mime: f.type || "application/octet-stream", size: buf.length, role, scanStatus: scan, status: aiEnabled() ? "PROCESSING" : "READY", statusDetail: aiEnabled() ? "Reading the report…" : "Stored. Enter the lines by hand below (AI reading isn't switched on)." } as any });
    if (aiEnabled()) {
      try { await assertAiBudget(company.id, estimateAiCost(/\.pdf$/i.test(f.name) ? Math.max(1, Math.round(buf.length / 80_000)) : 2).usd); }
      catch (e: any) { await db.jobCostFile.update({ where: { id: file.id }, data: { status: "READY", statusDetail: e.message } }); results.push(`${f.name}: ${e.message}`); continue; }
      await enqueue(company.id, "EXTRACT_JOB_COST", { fileId: file.id });
    }
    results.push(`${f.name}: uploaded`);
  }
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true as const, results };
}

const lineSchema = z.object({
  activity: z.string().trim().min(1), quantity: z.number().nullable(), unit: z.string().trim().nullable(),
  estimatedCost: z.number().nullable(), actualCost: z.number().nullable(), estimatedHours: z.number().nullable(), actualHours: z.number().nullable(),
  productionRateId: z.string().nullable(), notes: z.string().nullable(),
}).partial();

export async function saveJobLine(jobId: string, id: string | null, raw: unknown) {
  const { db } = await requireCtx();
  const data = lineSchema.parse(raw);
  if (data.productionRateId && !(await db.productionRate.findUnique({ where: { id: data.productionRateId } }))) data.productionRateId = null;
  if (id) {
    await db.jobCostLine.updateMany({ where: { id, jobId }, data });
  } else {
    const n = await db.jobCostLine.count({ where: { jobId } });
    await db.jobCostLine.create({ data: { jobId, activity: data.activity ?? "New activity", ...data, status: "CONFIRMED", sortOrder: n } as any });
  }
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true as const };
}

export async function setJobLineStatus(jobId: string, ids: string[], status: "CONFIRMED" | "IGNORED" | "DRAFT") {
  const { db } = await requireCtx();
  await db.jobCostLine.updateMany({ where: { jobId, id: { in: ids } }, data: { status } });
  revalidatePath(`/jobs/${jobId}`);
}

export async function deleteJobLine(jobId: string, id: string) {
  const { db } = await requireCtx();
  await db.jobCostLine.deleteMany({ where: { jobId, id } });
  revalidatePath(`/jobs/${jobId}`);
}

/** Inline "create new" for an activity that has no production rate in Setup yet. */
export async function createRateForLine(jobId: string, lineId: string) {
  const { db } = await requireAdminCtx();
  const line = await db.jobCostLine.findFirst({ where: { id: lineId, jobId } });
  if (!line) return { ok: false as const, error: "Line not found" };
  const rate = await db.productionRate.create({ data: { activity: line.activity, unit: line.unit || "EA", outputPerDay: null, hoursPerDay: 8, verified: false, notes: "Created from a past job; set its crew in Setup → Production rates" } as any });
  await db.jobCostLine.update({ where: { id: line.id }, data: { productionRateId: rate.id } });
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true as const, id: rate.id };
}

export async function markJobReviewed(jobId: string) {
  const { db } = await requireCtx();
  const drafts = await db.jobCostLine.count({ where: { jobId, status: "DRAFT" } });
  if (drafts) return { ok: false as const, error: `${drafts} line${drafts === 1 ? "" : "s"} still need${drafts === 1 ? "s" : ""} review` };
  await db.historicalJob.update({ where: { id: jobId }, data: { status: "REVIEWED" } });
  await refreshCalibration();
  revalidatePath("/jobs", "layout");
  return { ok: true as const };
}

/** Rebuild pending calibration suggestions from every reviewed job line mapped to a production rate. */
export async function refreshCalibration() {
  const { db } = await requireCtx();
  const [rates, lines, jobs] = await Promise.all([
    db.productionRate.findMany(),
    db.jobCostLine.findMany({ where: { status: "CONFIRMED", productionRateId: { not: null } } }),
    db.historicalJob.findMany({ where: { status: "REVIEWED" } }),
  ]);
  const reviewed = new Map(jobs.map((j) => [j.id, j.name]));
  await db.calibrationSuggestion.deleteMany({ where: { status: "PENDING" } });
  let made = 0;
  for (const r of rates) {
    const mine = lines.filter((l) => l.productionRateId === r.id && reviewed.has(l.jobId));
    if (!mine.length) continue;
    const crew = (r.crew ?? { labor: [] }) as { labor: { count: number }[] };
    const res = calibrate(
      { id: r.id, activity: r.activity, unit: r.unit, outputPerDay: r.outputPerDay, hoursPerDay: r.hoursPerDay, laborCount: crew.labor.reduce((a, x) => a + (x.count || 0), 0) },
      mine.map((l) => ({ jobId: l.jobId, jobName: reviewed.get(l.jobId)!, quantity: l.quantity, actualHours: l.actualHours, estimatedCost: l.estimatedCost, actualCost: l.actualCost })),
    );
    if (!res || (res.variancePct != null && Math.abs(res.variancePct) < 3)) continue;
    await db.calibrationSuggestion.create({
      data: { productionRateId: r.id, currentOutput: r.outputPerDay, actualOutput: res.actualOutput, suggestedOutput: Math.round(res.actualOutput * 10) / 10, basis: { method: res.method, jobs: res.basis } as any, status: "PENDING" } as any,
    });
    made++;
  }
  revalidatePath("/jobs", "layout");
  return { ok: true as const, made };
}

/** Approve, edit, or dismiss. Only an approval changes the company's production rate. */
export async function decideCalibration(id: string, action: "APPROVE" | "EDIT" | "DISMISS", value?: number) {
  const { db, user } = await requireAdminCtx();
  const s = await db.calibrationSuggestion.findUnique({ where: { id } });
  if (!s || s.status !== "PENDING") return { ok: false as const, error: "Already decided" };
  if (action === "DISMISS") {
    await db.calibrationSuggestion.update({ where: { id }, data: { status: "DISMISSED", decidedById: user.id, decidedAt: new Date() } });
  } else {
    const v = action === "EDIT" ? z.number().positive().parse(value) : s.suggestedOutput;
    const jobs = ((s.basis as any)?.jobs ?? []) as { jobName: string }[];
    await db.productionRate.update({
      where: { id: s.productionRateId },
      data: { outputPerDay: v, verified: true, calibratedAt: new Date(), calibrationNote: `Calibrated ${new Date().toLocaleDateString("en-US")} from ${[...new Set(jobs.map((j) => j.jobName))].join(", ")} (was ${s.currentOutput ?? "blank"})` },
    });
    await db.calibrationSuggestion.update({ where: { id }, data: { status: action === "EDIT" ? "EDITED" : "APPROVED", appliedOutput: v, decidedById: user.id, decidedAt: new Date() } });
  }
  revalidatePath("/", "layout");
  return { ok: true as const };
}

/** Post-job close-out: start a job record prefilled from the saved estimate, then enter or upload actuals. */
export async function closeOutProject(projectId: string) {
  const { db, company, user } = await requireCtx();
  const existing = await db.historicalJob.findFirst({ where: { projectId, kind: "CLOSEOUT" } });
  if (existing) redirect(`/jobs/${existing.id}`);
  const est = await loadEstimate(db, company, projectId);
  if (!est) return;
  const rates = new Map(est.setup.productionRates.map((r) => [r.id, r]));
  const asm = new Map(est.setup.assemblies.map((a) => [a.id, a]));
  const job = await db.historicalJob.create({ data: { name: est.project.name, jobNumber: est.project.jobNumber, projectId, kind: "CLOSEOUT", createdById: user.id, notes: "Estimated values come from the saved estimate. Enter what the job actually cost and took." } as any });
  const rows: any[] = [];
  for (const s of est.result.sections) for (const l of s.lines) {
    const a = asm.get(l.assemblyId);
    const r = a?.productionRateId ? rates.get(a.productionRateId) : null;
    const crew = (r?.crew ?? { labor: [] }) as { labor: { count: number }[] };
    const people = crew.labor.reduce((x, y) => x + (y.count || 0), 0);
    const hours = r?.outputPerDay ? (l.qty / r.outputPerDay) * r.hoursPerDay * Math.max(1, people) : null;
    rows.push({
      jobId: job.id, activity: `${s.bidItem.itemNumber} · ${l.assemblyName}`, quantity: Math.round(l.qty * 100) / 100, unit: l.unit,
      estimatedCost: Math.round(l.total * 100) / 100, estimatedHours: hours != null ? Math.round(hours * 10) / 10 : null,
      productionRateId: r?.id ?? null, assemblyId: l.assemblyId, status: "DRAFT", sortOrder: rows.length,
    });
  }
  if (rows.length) await db.jobCostLine.createMany({ data: rows });
  await db.project.update({ where: { id: projectId }, data: { status: "CLOSED" } });
  redirect(`/jobs/${job.id}`);
}
