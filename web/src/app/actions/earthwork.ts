"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCtx } from "@/lib/auth";
import { storage } from "@/lib/storage";
import { balance, cutFill, unpackTin } from "@/lib/landxml";

async function ctxFor(projectId: string) {
  const ctx = await requireCtx();
  const project = await ctx.db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Bid not found");
  return { ...ctx, project };
}

export async function setSurfaceRole(id: string, role: "EXISTING" | "PROPOSED") {
  const { db } = await requireCtx();
  const s = await db.surface.update({ where: { id }, data: { role: role === "PROPOSED" ? "PROPOSED" : "EXISTING" } });
  revalidatePath(`/projects/${s.projectId}/earthwork`);
}

export async function runEarthwork(projectId: string, existingId: string, proposedId: string, gridFt: number | null, soilTypeId: string | null) {
  const { db, user } = await ctxFor(projectId);
  if (existingId === proposedId) return { ok: false as const, error: "Pick two different surfaces" };
  const [e, p] = await Promise.all([db.surface.findUnique({ where: { id: existingId } }), db.surface.findUnique({ where: { id: proposedId } })]);
  if (!e || !p || e.projectId !== projectId || p.projectId !== projectId) return { ok: false as const, error: "Surface not found" };
  if (e.units !== p.units) return { ok: false as const, error: `${e.name} is in ${e.units} and ${p.name} is in ${p.units}. Export both in the same units.` };
  const soil = soilTypeId ? await db.soilType.findUnique({ where: { id: soilTypeId } }) : null;
  const g = gridFt != null ? z.number().min(0.25).max(100).parse(gridFt) : undefined;
  try {
    const [eb, pb] = await Promise.all([storage.get(e.companyId, e.dataKey), storage.get(p.companyId, p.dataKey)]);
    const r = cutFill(unpackTin(eb, e.name, e.units as any), unpackTin(pb, p.name, p.units as any), g);
    const b = balance(r.cutCy, r.fillCy, soil?.swellPct ?? null, soil?.shrinkPct ?? null);
    await db.earthworkCalc.create({
      data: {
        projectId, source: "LANDXML", existingId, proposedId, gridFt: r.gridFt, areaSf: r.areaSf, cutCy: r.cutCy, fillCy: r.fillCy,
        soilTypeId: soil?.id ?? null, swellPct: soil?.swellPct ?? null, shrinkPct: soil?.shrinkPct ?? null,
        exportLooseCy: b.exportLooseCy, importBankCy: b.importBankCy, preview: r.preview as any, createdById: user.id,
        note: `${e.name} (existing) vs ${p.name} (proposed)`,
      } as any,
    });
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(`/projects/${projectId}/earthwork`);
  return { ok: true as const };
}

const manualSchema = z.object({
  cutCy: z.number().min(0), fillCy: z.number().min(0), soilTypeId: z.string().nullable(),
  note: z.string().trim().min(3, "Say where these numbers came from (e.g. 'Agtek takeoff by J. Smith, 9/12')"),
});

export async function addManualEarthwork(projectId: string, raw: unknown) {
  const { db, user } = await ctxFor(projectId);
  const m = manualSchema.safeParse(raw);
  if (!m.success) return { ok: false as const, error: m.error.issues[0].message };
  const soil = m.data.soilTypeId ? await db.soilType.findUnique({ where: { id: m.data.soilTypeId } }) : null;
  const b = balance(m.data.cutCy, m.data.fillCy, soil?.swellPct ?? null, soil?.shrinkPct ?? null);
  await db.earthworkCalc.create({
    data: {
      projectId, source: "MANUAL", cutCy: m.data.cutCy, fillCy: m.data.fillCy, soilTypeId: soil?.id ?? null, swellPct: soil?.swellPct ?? null, shrinkPct: soil?.shrinkPct ?? null,
      exportLooseCy: b.exportLooseCy, importBankCy: b.importBankCy, note: m.data.note, createdById: user.id,
    } as any,
  });
  revalidatePath(`/projects/${projectId}/earthwork`);
  return { ok: true as const };
}

export async function deleteEarthwork(id: string) {
  const { db } = await requireCtx();
  const c = await db.earthworkCalc.findUnique({ where: { id } });
  if (!c) return;
  await db.earthworkCalc.delete({ where: { id } });
  revalidatePath(`/projects/${c.projectId}/earthwork`);
}

/** Put earthwork quantities on the bid as draft items; they still go through Review like everything else. */
export async function earthworkToBidItems(calcId: string, which: ("cut" | "fill" | "export" | "import")[]) {
  const { db } = await requireCtx();
  const c = await db.earthworkCalc.findUnique({ where: { id: calcId } });
  if (!c) return { ok: false as const, error: "Calculation not found" };
  const b = balance(c.cutCy, c.fillCy, c.swellPct, c.shrinkPct);
  const src = c.source === "LANDXML" ? `LandXML ${c.note ?? ""}, ${c.gridFt?.toFixed(1)} ft grid` : `Manual earthwork entry: ${c.note}`;
  const rows = {
    cut: { description: "Excavation (cut), bank measure", quantity: c.cutCy },
    fill: { description: "Embankment (fill), compacted in place", quantity: c.fillCy },
    export: { description: "Haul off surplus excavation, loose measure", quantity: b.exportLooseCy },
    import: { description: "Imported borrow, bank measure", quantity: b.importBankCy },
  };
  const existing = await db.bidItem.count({ where: { projectId: c.projectId } });
  const list = which.filter((w) => rows[w] && rows[w].quantity > 0);
  await db.bidItem.createMany({
    data: list.map((w, i) => ({
      projectId: c.projectId, itemNumber: `EW-${i + 1}`, description: rows[w].description, unit: "CY", quantity: Math.round(rows[w].quantity * 10) / 10,
      section: "Earthwork", source: c.source === "LANDXML" ? "LANDXML" : "MANUAL", sourceNote: `${src}${c.swellPct != null || c.shrinkPct != null ? ` · swell ${c.swellPct ?? 0}%, shrink ${c.shrinkPct ?? 0}%` : ""}`,
      status: "DRAFT", sortOrder: existing + i,
    })) as any,
  });
  revalidatePath(`/projects/${c.projectId}`, "layout");
  return { ok: true as const, added: list.length };
}
