"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/lib/auth";
import { enqueue } from "@/lib/jobs";
import { aiEnabled, assertAiBudget, estimateAiCost } from "@/lib/ai";

export async function runMeasureSuggestions(projectId: string, documentId: string, pageIndex: number) {
  const { db, company } = await requireCtx();
  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc || doc.projectId !== projectId) return { ok: false as const, error: "Document not found" };
  if (!aiEnabled()) return { ok: false as const, error: "AI suggestions aren't switched on for this server. Measure with the tools instead." };
  try { await assertAiBudget(company.id, estimateAiCost(1).usd); } catch (e: any) { return { ok: false as const, error: e.message }; }
  await enqueue(company.id, "SUGGEST_MEASURE", { documentId, pageIndex });
  return { ok: true as const };
}

/** Polled by the viewer while suggestions are being made. */
export async function pageSuggestions(documentId: string, pageIndex: number) {
  const { db } = await requireCtx();
  const [list, running] = await Promise.all([
    db.takeoffSuggestion.findMany({ where: { documentId, pageIndex, status: "SUGGESTED" }, orderBy: { createdAt: "asc" } }),
    db.job.count({ where: { type: "SUGGEST_MEASURE", status: { in: ["QUEUED", "RUNNING"] }, payload: { path: ["documentId"], equals: documentId } } }),
  ]);
  return { running: running > 0, suggestions: list.map((s) => ({ id: s.id, pageIndex: s.pageIndex, kind: s.kind, label: s.label, quantity: s.quantity, unit: s.unit, points: s.points as [number, number][], evidence: s.evidence, confidence: s.confidence })) };
}

const COLORS = ["#FF6B00", "#2563EB", "#059669", "#7C3AED", "#DB2777", "#0891B2", "#CA8A04", "#DC2626"];

export async function decideSuggestion(projectId: string, id: string, accept: boolean, edits?: { quantity?: number; bidItemId?: string | null; color?: string }) {
  const { db, user } = await requireCtx();
  const sg = await db.takeoffSuggestion.findUnique({ where: { id } });
  if (!sg || sg.projectId !== projectId || sg.status !== "SUGGESTED") return { ok: false as const, error: "Already decided" };
  if (!accept) {
    await db.takeoffSuggestion.update({ where: { id }, data: { status: "REJECTED", decidedById: user.id } });
    return { ok: true as const, markup: null };
  }
  const e = z.object({ quantity: z.number().positive().optional(), bidItemId: z.string().nullable().optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }).parse(edits ?? {});
  const bidItemId = e.bidItemId && (await db.bidItem.findUnique({ where: { id: e.bidItemId } })) ? e.bidItemId : null;
  const color = e.color ?? (bidItemId ? COLORS[[...bidItemId].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length] : "#B45309");
  const m = await db.takeoffMarkup.create({
    data: {
      projectId, documentId: sg.documentId, pageIndex: sg.pageIndex, bidItemId, tool: sg.kind === "COUNT" ? "COUNT" : sg.kind,
      points: ((sg.points as any[]).length ? sg.points : [[20, 20]]) as any, quantity: e.quantity ?? sg.quantity, unit: sg.unit, color,
      label: `AI: ${sg.label}${e.quantity != null && e.quantity !== sg.quantity ? ` (edited from ${sg.quantity})` : ""}`, source: "AI_ACCEPTED", createdById: user.id,
    } as any,
  });
  await db.takeoffSuggestion.update({ where: { id }, data: { status: "ACCEPTED", markupId: m.id, bidItemId, decidedById: user.id, quantity: e.quantity ?? sg.quantity } });
  revalidatePath(`/projects/${projectId}`, "layout");
  return { ok: true as const, markup: { id: m.id, documentId: m.documentId, pageIndex: m.pageIndex, bidItemId: m.bidItemId, tool: m.tool, points: m.points as [number, number][], quantity: m.quantity, unit: m.unit, color: m.color, label: m.label, source: "AI_ACCEPTED" } };
}
