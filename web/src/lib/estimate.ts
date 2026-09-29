import type { TenantDb } from "./db";
import {
  buildContext, computeEstimate, convertQty, normUnit,
  type AssemblyT, type CrewT, type QuotedPrice,
} from "./calc";

export async function loadSetup(db: TenantDb) {
  const [laborRoles, equipment, materials, productionRates, assemblies] = await Promise.all([
    db.laborRole.findMany({ orderBy: { name: "asc" } }),
    db.equipment.findMany({ orderBy: { name: "asc" } }),
    db.material.findMany({ orderBy: { name: "asc" } }),
    db.productionRate.findMany({ orderBy: { activity: "asc" } }),
    db.assembly.findMany({ orderBy: { name: "asc" } }),
  ]);
  return {
    laborRoles, equipment, materials,
    productionRates: productionRates.map((r) => ({ ...r, crew: (r.crew ?? { labor: [], equipment: [] }) as CrewT })),
    assemblies: assemblies.map((a) => ({ ...a, materials: (a.materials ?? []) as AssemblyT["materials"] })),
  };
}

/** Selected supplier prices per material for a project (from quote comparison). */
export async function loadQuotedPrices(db: TenantDb, projectId: string) {
  const lines = await db.materialLine.findMany({ where: { projectId, selectedQuoteLineId: { not: null }, materialId: { not: null } } });
  const qlIds = lines.map((l) => l.selectedQuoteLineId!) as string[];
  const qls = qlIds.length ? await db.quoteLine.findMany({ where: { id: { in: qlIds } } }) : [];
  const quotes = qls.length ? await db.quote.findMany({ where: { id: { in: [...new Set(qls.map((q) => q.quoteId))] } } }) : [];
  const map = new Map<string, QuotedPrice>();
  for (const l of lines) {
    const ql = qls.find((q) => q.id === l.selectedQuoteLineId);
    const q = ql && quotes.find((x) => x.id === ql.quoteId);
    if (ql && q && ql.unitPrice != null) {
      map.set(l.materialId!, { unitPrice: ql.unitPrice, supplierName: q.supplierName ?? "supplier", quotedAt: q.quotedAt ?? q.createdAt, validUntil: q.validUntil });
    }
  }
  return map;
}

export async function loadEstimate(db: TenantDb, company: { quoteExpiryDays: number; defaultMarkupPct: number | null; overheadPct: number | null; salesTaxPct: number | null; bondingPct: number | null }, projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return null;
  const [setup, bidItems, mappings, overrides, quotedPrices] = await Promise.all([
    loadSetup(db),
    db.bidItem.findMany({ where: { projectId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.bidItemAssembly.findMany({ where: { projectId } }),
    db.jobOverride.findMany({ where: { projectId } }),
    loadQuotedPrices(db, projectId),
  ]);
  const ctx = buildContext({
    laborMode: project.laborMode, quoteExpiryDays: company.quoteExpiryDays,
    laborRoles: setup.laborRoles, equipment: setup.equipment, materials: setup.materials,
    productionRates: setup.productionRates, overrides, quotedPrices,
  });
  const result = computeEstimate(ctx, {
    bidItems, mappings, assemblies: setup.assemblies,
    overheadPct: project.overheadPct ?? company.overheadPct,
    markupPct: project.markupPct ?? company.defaultMarkupPct,
    taxPct: project.taxPct ?? company.salesTaxPct,
    bondPct: project.bondPct ?? company.bondingPct,
    permitsCost: project.permitsCost,
  });
  return { project, setup, bidItems, mappings, overrides, result, ctx };
}

/**
 * Rebuild the consolidated material list from confirmed quantities × assembly
 * components. Manual lines and user edits to spec text are preserved; auto
 * lines are keyed by material so selections survive regeneration.
 */
export async function regenerateMaterialList(db: TenantDb, projectId: string) {
  const setup = await loadSetup(db);
  const bidItems = await db.bidItem.findMany({ where: { projectId, status: "CONFIRMED" } });
  const mappings = await db.bidItemAssembly.findMany({ where: { projectId, confirmed: true } });
  const matById = new Map(setup.materials.map((m) => [m.id, m]));
  const asmById = new Map(setup.assemblies.map((a) => [a.id, a]));
  type Agg = { materialId: string; qty: number; refs: { bidItemId: string; itemNumber: string; qty: number }[]; specs: Set<string>; sections: Set<string>; issues: string[] };
  const agg = new Map<string, Agg>();
  for (const map of mappings) {
    const bi = bidItems.find((b) => b.id === map.bidItemId);
    const a = asmById.get(map.assemblyId);
    if (!bi || !a || bi.quantity == null) continue;
    for (const comp of a.materials) {
      const m = matById.get(comp.materialId);
      if (!m) continue;
      let q = bi.quantity * map.qtyFactor * comp.qtyPerUnit;
      const g = agg.get(m.id) ?? { materialId: m.id, qty: 0, refs: [], specs: new Set<string>(), sections: new Set<string>(), issues: [] };
      if (comp.unit && normUnit(comp.unit) !== normUnit(m.unit)) {
        const c = convertQty(q, comp.unit, m.unit, m.densityTonsPerCy);
        if (c) q = c.qty; else g.issues.push(`Can't convert ${comp.unit} to ${m.unit}`);
      }
      g.qty += q;
      g.refs.push({ bidItemId: bi.id, itemNumber: bi.itemNumber, qty: q });
      if (bi.specRequirement) g.specs.add(bi.specRequirement);
      if (bi.specSection) g.sections.add(bi.specSection);
      agg.set(m.id, g);
    }
  }
  const existing = await db.materialLine.findMany({ where: { projectId, manual: false } });
  const keep = new Set<string>();
  let order = 0;
  for (const g of agg.values()) {
    const m = matById.get(g.materialId)!;
    const prev = existing.find((e) => e.materialId === g.materialId);
    const data = {
      description: m.name, unit: m.unit, quantity: Math.round(g.qty * 1000) / 1000, wastePct: m.wastePct ?? 0,
      categoryCode: m.categoryCode, bidItemRefs: g.refs,
      specRequirement: prev?.specRequirement ?? ([m.specNotes, ...g.specs].filter(Boolean).join("; ") || null),
      specSection: prev?.specSection ?? ([...g.sections].join(", ") || null),
      sortOrder: order++,
    };
    if (prev) { await db.materialLine.update({ where: { id: prev.id }, data }); keep.add(prev.id); }
    else { const c = await db.materialLine.create({ data: { ...data, projectId, materialId: m.id } as any }); keep.add(c.id); }
  }
  const stale = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
  if (stale.length) await db.materialLine.deleteMany({ where: { id: { in: stale } } });
  return { count: agg.size, removed: stale.length };
}

/** Quantity including waste, as sent to suppliers. */
export const orderQty = (l: { quantity: number; wastePct: number }) => Math.ceil(l.quantity * (1 + (l.wastePct ?? 0) / 100) * 100) / 100;
