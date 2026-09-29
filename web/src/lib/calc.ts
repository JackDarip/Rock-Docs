// Estimate math. Pure functions only: every number comes from the company's
// own setup data (or a job-level override, or a supplier quote), and every
// result carries a plain-English explanation and a confidence status.

export type ValueStatus = "CALIBRATED" | "QUOTED" | "VERIFIED" | "OVERRIDE" | "UNVERIFIED";

export type LaborRoleT = {
  id: string; name: string; baseWage: number | null; burdenPct: number | null;
  prevailingWage: number | null; prevailingFringe: number | null;
};
export type EquipmentT = {
  id: string; name: string; ownershipHourly: number | null; operatingHourly: number | null;
  standbyHourly?: number | null; mobilizationCost?: number | null;
};
export type MaterialT = {
  id: string; name: string; unit: string; unitCost: number | null; lastQuotedAt: Date | null;
  densityTonsPerCy: number | null; wastePct: number | null; categoryCode: string | null; specNotes: string | null;
};
export type CrewT = { labor: { laborRoleId: string; count: number }[]; equipment: { equipmentId: string; count: number }[] };
export type ProductionRateT = {
  id: string; activity: string; unit: string; outputPerDay: number | null; hoursPerDay: number;
  crew: CrewT; verified: boolean;
};
export type AssemblyMaterialT = { materialId: string; qtyPerUnit: number; unit?: string | null; note?: string | null };
export type AssemblyT = { id: string; name: string; unit: string; productionRateId: string | null; materials: AssemblyMaterialT[] };
export type OverrideT = { targetType: string; targetId: string; field: string; value: number; reason?: string | null };
export type QuotedPrice = { unitPrice: number; supplierName: string; quotedAt: Date | null; validUntil: Date | null };

export type CalcContext = {
  laborMode: "OPEN" | "PREVAILING";
  quoteExpiryDays: number;
  now: Date;
  laborRoles: Map<string, LaborRoleT>;
  equipment: Map<string, EquipmentT>;
  materials: Map<string, MaterialT>;
  productionRates: Map<string, ProductionRateT>;
  overrides: OverrideT[];
  /** Selected supplier quote price per material, from quote comparison. */
  quotedPrices: Map<string, QuotedPrice>;
};

export function buildContext(input: {
  laborMode?: string | null; quoteExpiryDays?: number; now?: Date;
  laborRoles: LaborRoleT[]; equipment: EquipmentT[]; materials: MaterialT[];
  productionRates: ProductionRateT[]; overrides?: OverrideT[]; quotedPrices?: Map<string, QuotedPrice>;
}): CalcContext {
  const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
  return {
    laborMode: input.laborMode === "PREVAILING" ? "PREVAILING" : "OPEN",
    quoteExpiryDays: input.quoteExpiryDays ?? 30,
    now: input.now ?? new Date(),
    laborRoles: byId(input.laborRoles),
    equipment: byId(input.equipment),
    materials: byId(input.materials),
    productionRates: byId(input.productionRates),
    overrides: input.overrides ?? [],
    quotedPrices: input.quotedPrices ?? new Map(),
  };
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number, d = 2) => n.toLocaleString("en-US", { maximumFractionDigits: d });

function pick(ctx: CalcContext, targetType: string, targetId: string, field: string, base: number | null) {
  const o = ctx.overrides.find((x) => x.targetType === targetType && x.targetId === targetId && x.field === field);
  if (o) return { value: o.value, overridden: true as const, reason: o.reason ?? null };
  return { value: base, overridden: false as const, reason: null };
}

// ---------- Units ----------

const UNIT_ALIASES: Record<string, string> = {
  TON: "TON", TONS: "TON", TN: "TON", T: "TON",
  CY: "CY", YD3: "CY", "CU YD": "CY", CUYD: "CY",
  LF: "LF", FT: "LF", FEET: "LF", LIN: "LF",
  SY: "SY", YD2: "SY", SF: "SF", FT2: "SF", EA: "EA", EACH: "EA", LS: "LS", GAL: "GAL", LB: "LB", LBS: "LB",
};
export function normUnit(u: string | null | undefined) {
  const k = (u ?? "").trim().toUpperCase().replace(/\./g, "");
  return UNIT_ALIASES[k] ?? k;
}

/** Convert a quantity between units using the company's own density values. */
export function convertQty(qty: number, from: string, to: string, densityTonsPerCy: number | null) {
  const f = normUnit(from), t = normUnit(to);
  if (!f || f === t) return { qty, note: null as string | null };
  if (f === "CY" && t === "TON" && densityTonsPerCy) return { qty: qty * densityTonsPerCy, note: `${num(qty, 3)} CY × ${densityTonsPerCy} tons/CY` };
  if (f === "TON" && t === "CY" && densityTonsPerCy) return { qty: qty / densityTonsPerCy, note: `${num(qty, 3)} tons ÷ ${densityTonsPerCy} tons/CY` };
  if (f === "SF" && t === "SY") return { qty: qty / 9, note: `${num(qty, 3)} SF ÷ 9` };
  if (f === "SY" && t === "SF") return { qty: qty * 9, note: `${num(qty, 3)} SY × 9` };
  return null;
}

/** Soil swell/shrink: bank CY -> loose CY (haul) or compacted CY (fill). */
export function swellShrink(bankCy: number, swellPct: number | null, shrinkPct: number | null) {
  return {
    looseCy: swellPct == null ? null : bankCy * (1 + swellPct / 100),
    compactedCy: shrinkPct == null ? null : bankCy * (1 - shrinkPct / 100),
  };
}

// ---------- Labor, equipment, crew ----------

export function laborHourly(ctx: CalcContext, role: LaborRoleT) {
  const issues: string[] = [];
  const burden = pick(ctx, "LABOR_ROLE", role.id, "burdenPct", role.burdenPct);
  let wage: ReturnType<typeof pick>;
  let fringe = 0;
  let basis: string;
  if (ctx.laborMode === "PREVAILING") {
    wage = pick(ctx, "LABOR_ROLE", role.id, "prevailingWage", role.prevailingWage);
    fringe = pick(ctx, "LABOR_ROLE", role.id, "prevailingFringe", role.prevailingFringe).value ?? 0;
    basis = "prevailing wage";
    if (wage.value == null) {
      issues.push(`${role.name}: no prevailing wage entered, using base wage`);
      wage = pick(ctx, "LABOR_ROLE", role.id, "baseWage", role.baseWage);
      basis = "base wage (no prevailing rate set)";
    }
  } else {
    wage = pick(ctx, "LABOR_ROLE", role.id, "baseWage", role.baseWage);
    basis = "base wage";
  }
  if (wage.value == null) issues.push(`${role.name}: no wage entered`);
  if (burden.value == null) issues.push(`${role.name}: no burden % entered`);
  const w = wage.value ?? 0, b = burden.value ?? 0;
  const hourly = w * (1 + b / 100) + fringe;
  const explain = `${role.name}: ${money(w)}/hr ${basis} + ${num(b)}% burden${fringe ? ` + ${money(fringe)} fringe` : ""} = ${money(hourly)}/hr`;
  return { hourly, explain, issues, overridden: wage.overridden || burden.overridden };
}

export function equipmentHourly(ctx: CalcContext, eq: EquipmentT) {
  const own = pick(ctx, "EQUIPMENT", eq.id, "ownershipHourly", eq.ownershipHourly);
  const op = pick(ctx, "EQUIPMENT", eq.id, "operatingHourly", eq.operatingHourly);
  const issues: string[] = [];
  if (own.value == null) issues.push(`${eq.name}: no ownership cost entered`);
  if (op.value == null) issues.push(`${eq.name}: no operating cost entered`);
  const hourly = (own.value ?? 0) + (op.value ?? 0);
  return {
    hourly, issues, overridden: own.overridden || op.overridden,
    explain: `${eq.name}: ${money(own.value ?? 0)}/hr ownership + ${money(op.value ?? 0)}/hr operating = ${money(hourly)}/hr`,
  };
}

export function crewCost(ctx: CalcContext, rate: ProductionRateT) {
  const explain: string[] = [];
  const issues: string[] = [];
  let laborHr = 0, equipHr = 0, overridden = false;
  for (const c of rate.crew.labor ?? []) {
    const role = ctx.laborRoles.get(c.laborRoleId);
    if (!role) { issues.push("A crew labor role was deleted from setup"); continue; }
    const h = laborHourly(ctx, role);
    laborHr += h.hourly * c.count;
    explain.push(`${c.count} × ${h.explain}`);
    issues.push(...h.issues);
    overridden ||= h.overridden;
  }
  for (const c of rate.crew.equipment ?? []) {
    const eq = ctx.equipment.get(c.equipmentId);
    if (!eq) { issues.push("A crew machine was deleted from setup"); continue; }
    const h = equipmentHourly(ctx, eq);
    equipHr += h.hourly * c.count;
    explain.push(`${c.count} × ${h.explain}`);
    issues.push(...h.issues);
    overridden ||= h.overridden;
  }
  if (!rate.crew.labor?.length && !rate.crew.equipment?.length) issues.push(`${rate.activity}: crew has no labor or equipment`);
  return { laborHr, equipHr, explain, issues, overridden };
}

/** Units produced per crew-hour, from the plain-language "per day" answer. */
export function unitsPerHour(ctx: CalcContext, rate: ProductionRateT) {
  const out = pick(ctx, "PRODUCTION_RATE", rate.id, "outputPerDay", rate.outputPerDay);
  const hrs = pick(ctx, "PRODUCTION_RATE", rate.id, "hoursPerDay", rate.hoursPerDay);
  const perDay = out.value ?? 0;
  const hours = hrs.value && hrs.value > 0 ? hrs.value : 8;
  return { perHour: perDay / hours, perDay, hours, overridden: out.overridden || hrs.overridden };
}

// ---------- Materials ----------

export function materialPrice(ctx: CalcContext, m: MaterialT) {
  const quoted = ctx.quotedPrices.get(m.id);
  if (quoted) {
    const expired = quoted.validUntil ? quoted.validUntil < ctx.now : false;
    return {
      price: quoted.unitPrice,
      status: (expired ? "UNVERIFIED" : "QUOTED") as ValueStatus,
      source: `Quote from ${quoted.supplierName}${quoted.quotedAt ? ` dated ${quoted.quotedAt.toLocaleDateString("en-US")}` : ""}${expired ? " (EXPIRED)" : ""}`,
    };
  }
  const o = pick(ctx, "MATERIAL", m.id, "unitCost", m.unitCost);
  if (o.overridden) return { price: o.value ?? 0, status: "OVERRIDE" as ValueStatus, source: `Job override${o.reason ? `: ${o.reason}` : ""}` };
  if (m.unitCost == null) return { price: 0, status: "UNVERIFIED" as ValueStatus, source: "No price entered (unquoted)" };
  const ageDays = m.lastQuotedAt ? (ctx.now.getTime() - m.lastQuotedAt.getTime()) / 864e5 : Infinity;
  const stale = ageDays > ctx.quoteExpiryDays;
  return {
    price: m.unitCost,
    status: (stale ? "UNVERIFIED" : "VERIFIED") as ValueStatus,
    source: m.lastQuotedAt
      ? `Company price, last quoted ${m.lastQuotedAt.toLocaleDateString("en-US")}${stale ? ` (older than ${ctx.quoteExpiryDays} days, unquoted)` : ""}`
      : "Company price, no quote date (unquoted)",
  };
}

// ---------- Assemblies ----------

export type CostPart = { kind: "LABOR" | "EQUIPMENT" | "MATERIAL"; amount: number; status: ValueStatus; label: string };

export type AssemblyUnitCost = {
  labor: number; equipment: number; material: number; total: number;
  parts: CostPart[]; explain: string[]; issues: string[];
  materialComponents: { materialId: string; name: string; qty: number; unit: string; wastePct: number; price: number; status: ValueStatus; source: string }[];
};

export function assemblyUnitCost(ctx: CalcContext, a: AssemblyT): AssemblyUnitCost {
  const explain: string[] = [];
  const issues: string[] = [];
  const parts: CostPart[] = [];
  let labor = 0, equipment = 0, material = 0;

  const rate = a.productionRateId ? ctx.productionRates.get(a.productionRateId) : undefined;
  if (!rate) {
    issues.push(`${a.name}: no production rate / crew selected, so labor and equipment are $0`);
  } else {
    const crew = crewCost(ctx, rate);
    const uph = unitsPerHour(ctx, rate);
    if (uph.perHour <= 0) {
      issues.push(`${rate.activity}: no daily production entered`);
    } else {
      labor = crew.laborHr / uph.perHour;
      equipment = crew.equipHr / uph.perHour;
    }
    explain.push(`Crew for "${rate.activity}" produces ${num(uph.perDay)} ${rate.unit} per ${num(uph.hours)}-hour day = ${num(uph.perHour, 3)} ${rate.unit}/hr.`);
    explain.push(...crew.explain.map((e) => `  ${e}`));
    explain.push(`Crew labor ${money(crew.laborHr)}/hr ÷ ${num(uph.perHour, 3)} ${rate.unit}/hr = ${money(labor)} per ${a.unit}.`);
    explain.push(`Crew equipment ${money(crew.equipHr)}/hr ÷ ${num(uph.perHour, 3)} ${rate.unit}/hr = ${money(equipment)} per ${a.unit}.`);
    issues.push(...crew.issues);
    if (!rate.verified) issues.push(`${rate.activity}: production rate not yet verified`);
    const crewStatus: ValueStatus = crew.issues.length || !rate.verified || uph.perHour <= 0
      ? "UNVERIFIED" : crew.overridden || uph.overridden ? "OVERRIDE" : "VERIFIED";
    parts.push({ kind: "LABOR", amount: labor, status: crewStatus, label: "Labor" });
    parts.push({ kind: "EQUIPMENT", amount: equipment, status: crewStatus, label: "Equipment" });
  }

  const materialComponents: AssemblyUnitCost["materialComponents"] = [];
  for (const comp of a.materials ?? []) {
    const m = ctx.materials.get(comp.materialId);
    if (!m) { issues.push("A material in this assembly was deleted from setup"); continue; }
    let qty = comp.qtyPerUnit;
    let convNote = "";
    if (comp.unit && normUnit(comp.unit) !== normUnit(m.unit)) {
      const c = convertQty(comp.qtyPerUnit, comp.unit, m.unit, m.densityTonsPerCy);
      if (!c) { issues.push(`${m.name}: can't convert ${comp.unit} to ${m.unit} (add a density in Materials)`); }
      else { qty = c.qty; convNote = ` (${c.note})`; }
    }
    const waste = m.wastePct ?? 0;
    const p = materialPrice(ctx, m);
    const cost = qty * (1 + waste / 100) * p.price;
    material += cost;
    if (p.status === "UNVERIFIED") issues.push(`${m.name}: ${p.source}`);
    parts.push({ kind: "MATERIAL", amount: cost, status: p.status, label: m.name });
    materialComponents.push({ materialId: m.id, name: m.name, qty, unit: m.unit, wastePct: waste, price: p.price, status: p.status, source: p.source });
    explain.push(`${m.name}: ${num(qty, 4)} ${m.unit}${convNote} + ${num(waste)}% waste × ${money(p.price)}/${m.unit} [${p.source}] = ${money(cost)} per ${a.unit}.`);
  }
  const total = labor + equipment + material;
  explain.push(`Total per ${a.unit}: ${money(labor)} labor + ${money(equipment)} equipment + ${money(material)} materials = ${money(total)}.`);
  return { labor, equipment, material, total, parts, explain, issues, materialComponents };
}

// ---------- Estimate ----------

export type BidItemT = {
  id: string; itemNumber: string; description: string; unit: string; quantity: number | null;
  status: string; confidence: string; aiExtracted: boolean; source: string; section: string | null;
  documentId?: string | null; pageIndex?: number | null;
};
export type MappingT = { id: string; bidItemId: string; assemblyId: string; qtyFactor: number; confirmed: boolean };

export type EstimateLine = {
  mappingId: string; assemblyId: string; assemblyName: string; qty: number; unit: string;
  unitCost: AssemblyUnitCost; labor: number; equipment: number; material: number; total: number;
  status: ValueStatus; parts: CostPart[]; explain: string[]; issues: string[];
};
export type EstimateSection = {
  bidItem: BidItemT; lines: EstimateLine[]; direct: number; blocked: string[];
};
export type EstimateTotals = {
  labor: number; equipment: number; material: number; materialTax: number; direct: number;
  overhead: number; markup: number; permits: number; bond: number; total: number;
  overheadPct: number; markupPct: number; taxPct: number; bondPct: number;
};
export type EstimateResult = {
  sections: EstimateSection[]; totals: EstimateTotals;
  confidence: { pctTrusted: number; byStatus: Record<ValueStatus, number> };
  blockers: string[];
};

export function computeEstimate(
  ctx: CalcContext,
  input: {
    bidItems: BidItemT[]; mappings: MappingT[]; assemblies: AssemblyT[];
    overheadPct?: number | null; markupPct?: number | null; taxPct?: number | null; bondPct?: number | null; permitsCost?: number | null;
  },
): EstimateResult {
  const asm = new Map(input.assemblies.map((a) => [a.id, a]));
  const byStatus: Record<ValueStatus, number> = { CALIBRATED: 0, QUOTED: 0, VERIFIED: 0, OVERRIDE: 0, UNVERIFIED: 0 };
  const blockers: string[] = [];
  let labor = 0, equipment = 0, material = 0;

  const sections: EstimateSection[] = input.bidItems.map((bi) => {
    const blocked: string[] = [];
    if (bi.status !== "CONFIRMED") blocked.push("Quantity not yet confirmed in review");
    if (bi.quantity == null) blocked.push("No quantity");
    const maps = input.mappings.filter((m) => m.bidItemId === bi.id);
    if (!maps.length) blocked.push("Not mapped to an assembly");
    if (maps.some((m) => !m.confirmed)) blocked.push("Suggested mapping not yet confirmed");
    const lines: EstimateLine[] = [];
    for (const m of maps) {
      const a = asm.get(m.assemblyId);
      if (!a) continue;
      const uc = assemblyUnitCost(ctx, a);
      const qty = (bi.quantity ?? 0) * m.qtyFactor;
      const qtyTrusted = bi.status === "CONFIRMED";
      const parts = uc.parts.map((p) => ({ ...p, amount: p.amount * qty, status: qtyTrusted ? p.status : ("UNVERIFIED" as ValueStatus) }));
      for (const p of parts) byStatus[p.status] += p.amount;
      const l = uc.labor * qty, e = uc.equipment * qty, mt = uc.material * qty;
      labor += l; equipment += e; material += mt;
      const worst: ValueStatus = parts.some((p) => p.status === "UNVERIFIED") ? "UNVERIFIED"
        : parts.some((p) => p.status === "OVERRIDE") ? "OVERRIDE"
        : parts.some((p) => p.status === "QUOTED") ? "QUOTED" : "VERIFIED";
      lines.push({
        mappingId: m.id, assemblyId: a.id, assemblyName: a.name, qty, unit: a.unit, unitCost: uc,
        labor: l, equipment: e, material: mt, total: l + e + mt, status: worst, parts,
        explain: [
          `Quantity: ${num(bi.quantity ?? 0, 3)} ${bi.unit} (bid item ${bi.itemNumber}, source: ${bi.source.replace("_", " ").toLowerCase()})${m.qtyFactor !== 1 ? ` × ${m.qtyFactor} factor` : ""} = ${num(qty, 3)} ${a.unit}.`,
          ...uc.explain,
          `Line total: ${num(qty, 3)} ${a.unit} × ${money(uc.total)} = ${money(uc.total * qty)}.`,
        ],
        issues: uc.issues,
      });
    }
    if (blocked.length) blockers.push(`Bid item ${bi.itemNumber}: ${blocked.join("; ")}`);
    return { bidItem: bi, lines, direct: lines.reduce((s, x) => s + x.total, 0), blocked };
  });

  const overheadPct = input.overheadPct ?? 0, markupPct = input.markupPct ?? 0, taxPct = input.taxPct ?? 0, bondPct = input.bondPct ?? 0;
  const materialTax = material * (taxPct / 100);
  const direct = labor + equipment + material + materialTax;
  const overhead = direct * (overheadPct / 100);
  const markup = (direct + overhead) * (markupPct / 100);
  const permits = input.permitsCost ?? 0;
  const pre = direct + overhead + markup + permits;
  const bond = pre * (bondPct / 100);
  const total = pre + bond;
  const costBase = Object.values(byStatus).reduce((s, x) => s + x, 0);
  const trusted = byStatus.CALIBRATED + byStatus.QUOTED + byStatus.VERIFIED + byStatus.OVERRIDE;
  return {
    sections,
    totals: { labor, equipment, material, materialTax, direct, overhead, markup, permits, bond, total, overheadPct, markupPct, taxPct, bondPct },
    confidence: { pctTrusted: costBase > 0 ? Math.round((trusted / costBase) * 100) : 0, byStatus },
    blockers,
  };
}

/** Owner-schedule unit price for a bid item: its share of the marked-up total ÷ quantity. */
export function bidItemUnitPrices(est: EstimateResult) {
  const { direct, total } = est.totals;
  const factor = direct > 0 ? total / direct : 1;
  return est.sections.map((s) => {
    const withTax = s.lines.reduce((acc, l) => acc + l.labor + l.equipment + l.material * (1 + est.totals.taxPct / 100), 0);
    const extended = withTax * factor;
    const qty = s.bidItem.quantity ?? 0;
    return { bidItemId: s.bidItem.id, itemNumber: s.bidItem.itemNumber, description: s.bidItem.description, unit: s.bidItem.unit, quantity: qty, unitPrice: qty ? extended / qty : 0, extended };
  });
}
