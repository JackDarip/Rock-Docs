"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCtx } from "@/lib/auth";
import { enqueue } from "@/lib/jobs";
import { aiEnabled, assertAiBudget, estimateAiCost } from "@/lib/ai";
import { applyRequirement } from "@/lib/specs";

export async function runSpecExtraction(projectId: string) {
  const { db, company } = await requireCtx();
  const docs = await db.document.findMany({ where: { projectId, kind: "SPECS" } });
  if (!docs.length) return { ok: false as const, error: "Upload the specifications in the Plan room and tag them as Specifications first." };
  if (!aiEnabled()) return { ok: false as const, error: "AI reading isn't switched on for this server. Add requirements by hand below." };
  const pages = docs.reduce((n, d) => n + Math.min(60, d.pageCount ?? 30), 0);
  try { await assertAiBudget(company.id, estimateAiCost(pages).usd); } catch (e: any) { return { ok: false as const, error: e.message }; }
  await enqueue(company.id, "EXTRACT_SPECS", { projectId });
  revalidatePath(`/projects/${projectId}/specs`);
  return { ok: true as const };
}

const reqSchema = z.object({
  bidItemId: z.string().nullable(), specSection: z.string().trim().max(60).nullable(),
  material: z.string().trim().max(200).nullable(), requirement: z.string().trim().min(3, "Describe the requirement").max(2000),
});

export async function addRequirement(projectId: string, raw: unknown) {
  const { db } = await requireCtx();
  const r = reqSchema.safeParse(raw);
  if (!r.success) return { ok: false as const, error: r.error.issues[0].message };
  if (r.data.bidItemId && !(await db.bidItem.findUnique({ where: { id: r.data.bidItemId } }))) return { ok: false as const, error: "Bid item not found" };
  await db.specRequirement.create({ data: { projectId, ...r.data, source: "MANUAL", status: "CONFIRMED" } as any });
  await applyRequirement(db, r.data);
  revalidatePath(`/projects/${projectId}`, "layout");
  return { ok: true as const };
}

export async function decideRequirement(id: string, status: "CONFIRMED" | "REJECTED", edits?: { requirement?: string; bidItemId?: string | null; material?: string | null }) {
  const { db } = await requireCtx();
  const r = await db.specRequirement.findUnique({ where: { id } });
  if (!r) return { ok: false as const, error: "Not found" };
  const patch = edits ? z.object({ requirement: z.string().trim().min(3).optional(), bidItemId: z.string().nullable().optional(), material: z.string().nullable().optional() }).parse(edits) : {};
  const u = await db.specRequirement.update({ where: { id }, data: { status: status === "CONFIRMED" ? "CONFIRMED" : "REJECTED", ...patch } });
  if (u.status === "CONFIRMED" && !u.missingStandard) await applyRequirement(db, u);
  revalidatePath(`/projects/${r.projectId}`, "layout");
  return { ok: true as const };
}
