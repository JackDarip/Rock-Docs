import type { TenantDb } from "./db";

export const SETUP_STEPS = [
  { key: "company", label: "Company basics", href: "/setup/company", blurb: "Name, logo, accent color, markup, overhead, tax, RFQ email template." },
  { key: "labor", label: "Labor", href: "/setup/labor", blurb: "Crew roles with base wage, burden, and prevailing wage rates." },
  { key: "equipment", label: "Equipment", href: "/setup/equipment", blurb: "Machines with ownership, operating, standby and move costs." },
  { key: "materials", label: "Materials", href: "/setup/materials", blurb: "What you buy, in the units you buy it, with your latest prices." },
  { key: "suppliers", label: "Suppliers & subs", href: "/setup/suppliers", blurb: "Who you get quotes from, by category and service area." },
  { key: "production", label: "Production rates", href: "/setup/production", blurb: "How much your crews really get done in a day." },
  { key: "soils", label: "Soil behavior", href: "/setup/soils", blurb: "Swell and shrink for the soils you dig." },
  { key: "assemblies", label: "Assemblies", href: "/setup/assemblies", blurb: "Reusable work packages that turn quantities into costs and material lists." },
  { key: "email", label: "Email sending", href: "/setup/email", blurb: "Optional: how RFQs are sent from inside the app." },
] as const;

export type StepKey = (typeof SETUP_STEPS)[number]["key"];

export async function setupStatus(db: TenantDb, company: { name: string; defaultMarkupPct: number | null; overheadPct: number | null; salesTaxPct: number | null; rfqSubject: string | null; setupProgress: unknown; emailMethod: string }) {
  const [labor, equip, mats, sups, prod, soils, asm] = await Promise.all([
    db.laborRole.count({ where: { baseWage: { not: null }, burdenPct: { not: null } } }),
    db.equipment.count({ where: { ownershipHourly: { not: null }, operatingHourly: { not: null } } }),
    db.material.count({ where: { unitCost: { not: null } } }),
    db.supplier.count(),
    db.productionRate.count({ where: { outputPerDay: { not: null } } }),
    db.soilType.count({ where: { verified: true } }),
    db.assembly.count(),
  ]);
  const skipped = ((company.setupProgress ?? {}) as { skipped?: string[] }).skipped ?? [];
  const done: Record<StepKey, boolean> = {
    company: company.defaultMarkupPct != null && company.overheadPct != null && company.salesTaxPct != null && !!company.rfqSubject,
    labor: labor > 0, equipment: equip > 0, materials: mats > 0, suppliers: sups > 0,
    production: prod > 0, soils: soils > 0, assemblies: asm > 0, email: !!company.emailMethod,
  };
  const steps = SETUP_STEPS.map((s) => ({ ...s, done: done[s.key], skipped: skipped.includes(s.key) && !done[s.key] }));
  const score = Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
  return { steps, score };
}
