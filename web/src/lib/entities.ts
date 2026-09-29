import { z } from "zod";

// Registry of inline-editable tables. Each entry names the Prisma model,
// validates the fields a client may write, and says who may write it.

const s = () => z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().trim().nullable());
const req = () => z.string().trim().min(1, "Required");
const n = () => z.preprocess((v) => (v === "" || v === undefined || v === null ? null : Number(v)), z.number().finite().nullable());
const b = () => z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean());
const d = () => z.preprocess((v) => (v ? new Date(v as string) : null), z.date().nullable());
const arr = () => z.preprocess((v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : []), z.array(z.string()));

export const ENTITIES = {
  laborRole: { model: "laborRole", admin: true, schema: z.object({ name: req(), baseWage: n(), burdenPct: n(), prevailingWage: n(), prevailingFringe: n(), notes: s() }) },
  prevailingWageRate: { model: "prevailingWageRate", admin: true, schema: z.object({ county: req(), classification: req(), projectRef: s(), laborRoleId: s(), baseRate: n(), fringe: n(), source: s() }) },
  equipment: { model: "equipment", admin: true, schema: z.object({ name: req(), type: s(), ownershipHourly: n(), operatingHourly: n(), standbyHourly: n(), mobilizationCost: n(), notes: s() }) },
  material: { model: "material", admin: true, schema: z.object({ name: req(), unit: req(), unitCost: n(), categoryCode: s(), supplierId: s(), lastQuotedAt: d(), densityTonsPerCy: n(), wastePct: n(), specNotes: s() }) },
  supplier: { model: "supplier", admin: true, schema: z.object({ kind: z.enum(["SUPPLIER", "SUBCONTRACTOR"]).default("SUPPLIER"), name: req(), categories: arr(), serviceArea: s(), preferred: b(), notes: s() }) },
  contact: { model: "contact", admin: true, schema: z.object({ supplierId: req(), name: req(), title: s(), email: s(), phone: s(), isPrimary: b() }) },
  supplierCategory: { model: "supplierCategory", admin: true, schema: z.object({ code: z.string().trim().min(1).max(6).transform((x) => x.toUpperCase().replace(/[^A-Z0-9]/g, "")), name: req(), kind: z.enum(["SUPPLIER", "SUBCONTRACTOR"]).default("SUPPLIER") }) },
  soilType: { model: "soilType", admin: true, schema: z.object({ name: req(), swellPct: n(), shrinkPct: n(), notes: s(), verified: b() }) },
  bidItem: { model: "bidItem", admin: false, project: true, schema: z.object({ itemNumber: req(), description: req(), specSection: s(), unit: req(), quantity: n(), section: s(), sourceNote: s(), specRequirement: s() }) },
  materialLine: { model: "materialLine", admin: false, project: true, schema: z.object({ description: req(), unit: req(), quantity: n().transform((x) => x ?? 0), wastePct: n().transform((x) => x ?? 0), specRequirement: s(), specSection: s(), categoryCode: s(), excluded: b() }) },
  quoteLine: { model: "quoteLine", admin: false, schema: z.object({ quoteId: req(), description: req(), quantity: n(), unit: s(), unitPrice: n(), extended: n(), leadTime: s(), notes: s(), isAlternate: b(), materialLineId: s(), section: s() }) },
} as const;

export type EntityName = keyof typeof ENTITIES;
