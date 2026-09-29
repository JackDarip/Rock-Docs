import { describe, expect, it } from "vitest";
import { assemblyUnitCost, bidItemUnitPrices, buildContext, computeEstimate, convertQty, swellShrink } from "@/lib/calc";

const setup = () => buildContext({
  laborMode: "OPEN", now: new Date("2026-09-01"), quoteExpiryDays: 30,
  laborRoles: [
    { id: "op", name: "Operator", baseWage: 40, burdenPct: 35, prevailingWage: 50, prevailingFringe: 20 },
    { id: "lab", name: "Laborer", baseWage: 30, burdenPct: 35, prevailingWage: null, prevailingFringe: null },
  ],
  equipment: [{ id: "ex", name: "Excavator", ownershipHourly: 60, operatingHourly: 40 }],
  materials: [
    { id: "pipe", name: "8in PVC", unit: "LF", unitCost: 10, lastQuotedAt: new Date("2026-08-20"), densityTonsPerCy: null, wastePct: 5, categoryCode: "PIPE", specNotes: null },
    { id: "rock", name: "Bedding rock", unit: "TON", unitCost: 20, lastQuotedAt: new Date("2026-01-01"), densityTonsPerCy: 1.5, wastePct: 0, categoryCode: "AGG", specNotes: null },
  ],
  productionRates: [{ id: "pr", activity: "Lay 8in pipe", unit: "LF", outputPerDay: 400, hoursPerDay: 8, verified: true, crew: { labor: [{ laborRoleId: "op", count: 1 }, { laborRoleId: "lab", count: 2 }], equipment: [{ equipmentId: "ex", count: 1 }] } }],
});

const asm = { id: "a", name: "8in sewer", unit: "LF", productionRateId: "pr", materials: [{ materialId: "pipe", qtyPerUnit: 1 }, { materialId: "rock", qtyPerUnit: 0.1, unit: "CY" }] };

describe("estimate math", () => {
  it("computes assembly cost per unit from crew, production and materials", () => {
    const uc = assemblyUnitCost(setup(), asm);
    // crew labor: 40*1.35 + 2*30*1.35 = 54 + 81 = 135/hr; equipment 100/hr; 50 LF/hr
    expect(uc.labor).toBeCloseTo(2.7, 6);
    expect(uc.equipment).toBeCloseTo(2.0, 6);
    // pipe: 1 LF * 1.05 * $10 = 10.5; rock: 0.1 CY * 1.5 = 0.15 ton * $20 = 3
    expect(uc.material).toBeCloseTo(13.5, 6);
    expect(uc.total).toBeCloseTo(18.2, 6);
    // rock price is older than 30 days, so it's flagged
    expect(uc.materialComponents.find((m) => m.materialId === "rock")!.status).toBe("UNVERIFIED");
    expect(uc.issues.some((i) => /Bedding rock/.test(i))).toBe(true);
  });

  it("uses prevailing wage + fringe in prevailing mode and falls back with a flag", () => {
    const ctx = setup();
    ctx.laborMode = "PREVAILING";
    const uc = assemblyUnitCost(ctx, asm);
    // op: 50*1.35+20 = 87.5; laborer has no prevailing -> base 40.5 each = 81 -> 168.5/hr / 50
    expect(uc.labor).toBeCloseTo(168.5 / 50, 6);
    expect(uc.issues.some((i) => /no prevailing wage/.test(i))).toBe(true);
  });

  it("applies job overrides without touching company values", () => {
    const ctx = setup();
    ctx.overrides = [{ targetType: "PRODUCTION_RATE", targetId: "pr", field: "outputPerDay", value: 800 }];
    const uc = assemblyUnitCost(ctx, asm);
    expect(uc.labor).toBeCloseTo(1.35, 6);
    expect(ctx.productionRates.get("pr")!.outputPerDay).toBe(400);
  });

  it("uses a selected supplier quote over the company price", () => {
    const ctx = setup();
    ctx.quotedPrices.set("rock", { unitPrice: 18, supplierName: "Acme", quotedAt: new Date("2026-08-30"), validUntil: new Date("2026-10-01") });
    const c = assemblyUnitCost(ctx, asm).materialComponents.find((m) => m.materialId === "rock")!;
    expect(c.price).toBe(18);
    expect(c.status).toBe("QUOTED");
  });

  it("rolls up an estimate with tax, overhead, markup and bond, and blocks unconfirmed items", () => {
    const ctx = setup();
    const est = computeEstimate(ctx, {
      bidItems: [
        { id: "b1", itemNumber: "1", description: "8in sewer", unit: "LF", quantity: 1000, status: "CONFIRMED", confidence: "HIGH", aiExtracted: false, source: "BID_SCHEDULE", section: null },
        { id: "b2", itemNumber: "2", description: "Manholes", unit: "EA", quantity: 4, status: "DRAFT", confidence: "LOW", aiExtracted: true, source: "BID_SCHEDULE", section: null },
      ],
      mappings: [{ id: "m1", bidItemId: "b1", assemblyId: "a", qtyFactor: 1, confirmed: true }],
      assemblies: [asm], overheadPct: 10, markupPct: 10, taxPct: 5, bondPct: 1,
    });
    const t = est.totals;
    expect(t.labor).toBeCloseTo(2700, 4);
    expect(t.material).toBeCloseTo(13500, 4);
    expect(t.materialTax).toBeCloseTo(675, 4);
    expect(t.direct).toBeCloseTo(2700 + 2000 + 13500 + 675, 4);
    expect(t.total).toBeCloseTo(t.direct * 1.1 * 1.1 * 1.01, 4);
    expect(est.blockers.length).toBe(1);
    expect(est.blockers[0]).toMatch(/Bid item 2/);
    // Unit prices spread markups so extensions sum to the total bid
    const prices = bidItemUnitPrices(est);
    expect(prices.reduce((s, p) => s + p.extended, 0)).toBeCloseTo(t.total, 4);
    expect(est.confidence.pctTrusted).toBeGreaterThan(0);
    expect(est.confidence.pctTrusted).toBeLessThan(100);
  });

  it("converts units with company density and applies swell/shrink", () => {
    expect(convertQty(10, "CY", "TON", 1.4)!.qty).toBeCloseTo(14);
    expect(convertQty(10, "CY", "TON", null)).toBeNull();
    expect(convertQty(18, "SF", "SY", null)!.qty).toBeCloseTo(2);
    const s = swellShrink(100, 25, 10);
    expect(s.looseCy).toBeCloseTo(125);
    expect(s.compactedCy).toBeCloseTo(90);
  });
});
