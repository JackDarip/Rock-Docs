"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminCtx } from "@/lib/auth";
import { enqueue } from "@/lib/jobs";
import { newKey, putScanned } from "@/lib/storage";
import { aiEnabled, assertAiBudget, estimateAiCost } from "@/lib/ai";

const PATH = { WAGES: "/setup/labor", EQUIPMENT: "/setup/equipment" } as const;

/** Upload a wage determination or equipment cost report for AI reading. Nothing is saved to Setup until reviewed. */
export async function uploadSetupDoc(kind: "WAGES" | "EQUIPMENT", formData: FormData) {
  const { db, company, user } = await requireAdminCtx();
  const f = formData.get("file") as File | null;
  if (!f?.size) return { ok: false as const, error: "Choose a file" };
  if (!aiEnabled()) return { ok: false as const, error: "AI reading isn't switched on for this server. Enter the values in the table instead." };
  if (kind === "WAGES" && !/\.pdf$/i.test(f.name)) return { ok: false as const, error: "Upload the wage determination as a PDF" };
  if (!/\.(pdf|xlsx|csv)$/i.test(f.name)) return { ok: false as const, error: "Use a PDF, Excel or CSV file" };
  const buf = Buffer.from(await f.arrayBuffer());
  try { await assertAiBudget(company.id, estimateAiCost(Math.max(1, Math.round(buf.length / 80_000))).usd); } catch (e: any) { return { ok: false as const, error: e.message }; }
  const key = newKey(company.id, "setup-imports", f.name);
  try { await putScanned(company.id, key, buf); } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "Upload refused" }; }
  const d = await db.importDraft.create({ data: { kind, filename: f.name, storageKey: key, status: "PROCESSING", statusDetail: "Reading…", createdById: user.id } as any });
  await enqueue(company.id, "EXTRACT_SETUP_DOC", { draftId: d.id });
  revalidatePath(PATH[kind]);
  return { ok: true as const };
}

const pickSchema = z.array(z.object({ index: z.number().int().min(0), laborRoleId: z.string().nullable().optional() }));

/** Save the rows a person ticked. Wage rates can also update the matching crew role's prevailing wage. */
export async function applySetupImport(draftId: string, rawPicks: unknown, updateRoles: boolean) {
  const { db } = await requireAdminCtx();
  const d = await db.importDraft.findUnique({ where: { id: draftId } });
  if (!d || d.status !== "READY") return { ok: false as const, error: "Nothing to apply" };
  const picks = pickSchema.parse(rawPicks);
  const rows = (d.rows ?? []) as any[];
  const meta = (d.meta ?? {}) as { number?: string | null; effective?: string | null; counties?: string[] };
  let n = 0;
  for (const p of picks) {
    const r = rows[p.index];
    if (!r) continue;
    if (d.kind === "WAGES") {
      const role = p.laborRoleId ? await db.laborRole.findUnique({ where: { id: p.laborRoleId } }) : null;
      await db.prevailingWageRate.create({
        data: {
          county: r.county ?? meta.counties?.join(", ") ?? "—", classification: r.classification, baseRate: r.base_rate, fringe: r.fringe,
          laborRoleId: role?.id ?? null, projectRef: meta.number ?? null, source: `AI-read from ${d.filename}, reviewed`,
          effectiveAt: meta.effective && !isNaN(Date.parse(meta.effective)) ? new Date(meta.effective) : null,
        } as any,
      });
      if (role && updateRoles) await db.laborRole.update({ where: { id: role.id }, data: { prevailingWage: r.base_rate ?? role.prevailingWage, prevailingFringe: r.fringe ?? role.prevailingFringe } });
    } else {
      await db.equipment.create({
        data: {
          name: r.name, type: r.type, ownershipHourly: r.ownership_hourly, operatingHourly: r.operating_hourly,
          standbyHourly: r.standby_hourly, mobilizationCost: r.mobilization_cost, notes: `From ${d.filename}`,
        } as any,
      });
    }
    n++;
  }
  await db.importDraft.update({ where: { id: d.id }, data: { status: "DONE", statusDetail: `Added ${n} row${n === 1 ? "" : "s"}` } });
  revalidatePath(PATH[d.kind as keyof typeof PATH]);
  return { ok: true as const, added: n };
}

export async function discardSetupImport(draftId: string) {
  const { db } = await requireAdminCtx();
  const d = await db.importDraft.findUnique({ where: { id: draftId } });
  if (!d) return;
  await db.importDraft.update({ where: { id: d.id }, data: { status: "DONE", statusDetail: "Discarded" } });
  revalidatePath(PATH[d.kind as keyof typeof PATH]);
}
