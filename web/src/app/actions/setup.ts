"use server";

import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminCtx, requireCtx, hashPassword } from "@/lib/auth";
import { newKey, storage } from "@/lib/storage";

export async function skipStep(step: string) {
  const { company } = await requireCtx();
  const prog = (company.setupProgress ?? {}) as { skipped?: string[] };
  const skipped = Array.from(new Set([...(prog.skipped ?? []), step]));
  await prisma.company.update({ where: { id: company.id }, data: { setupProgress: { ...prog, skipped } } });
}

const companyFields = z.object({
  name: z.string().trim().min(1),
  rfqPrefix: z.string().trim().min(1).max(5).transform((s) => s.toUpperCase().replace(/[^A-Z0-9]/g, "")),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  defaultMarkupPct: z.number().nullable(),
  overheadPct: z.number().nullable(),
  salesTaxPct: z.number().nullable(),
  bondingPct: z.number().nullable(),
  bondingApproach: z.string().nullable(),
  projectTypes: z.array(z.string()),
  rfqSubject: z.string().nullable(),
  rfqBody: z.string().nullable(),
  rfqSignature: z.string().nullable(),
  quoteExpiryDays: z.number().int().min(1).max(365),
  takeoffVariancePct: z.number().min(0).max(100),
  aiMonthlyLimitUsd: z.number().min(0),
  emailMethod: z.enum(["PLATFORM", "DOMAIN", "CONNECTED"]),
  customEmailDomain: z.string().nullable(),
}).partial();

export async function updateCompany(field: string, value: unknown) {
  const { company } = await requireAdminCtx();
  const parsed = companyFields.safeParse({ [field]: value === "" ? null : value });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid value" };
  await prisma.company.update({ where: { id: company.id }, data: parsed.data });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function uploadLogo(formData: FormData) {
  const { company } = await requireAdminCtx();
  const file = formData.get("logo") as File | null;
  if (!file || !file.size) return { ok: false as const, error: "Choose an image file" };
  if (file.size > 3e6) return { ok: false as const, error: "Logo must be under 3 MB" };
  const buf = Buffer.from(await file.arrayBuffer());
  // Check the bytes, not the browser's claimed type: PNG and JPG are the formats
  // that also embed in PDFs and spreadsheets.
  const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (!isPng && !isJpg) return { ok: false as const, error: "Use a PNG or JPG image (they also appear on your PDFs and RFQ spreadsheets)" };
  const key = newKey(company.id, "branding", isPng ? "logo.png" : "logo.jpg");
  await storage.put(company.id, key, buf);
  const old = company.logoPath;
  const updated = await prisma.company.update({ where: { id: company.id }, data: { logoPath: key } });
  if (old) await storage.remove(company.id, old).catch(() => {});
  revalidatePath("/", "layout");
  return { ok: true as const, url: `/api/logo?v=${updated.updatedAt.getTime()}` };
}

export async function removeLogo() {
  const { company } = await requireAdminCtx();
  if (company.logoPath) {
    await prisma.company.update({ where: { id: company.id }, data: { logoPath: null } });
    await storage.remove(company.id, company.logoPath).catch(() => {});
  }
  revalidatePath("/", "layout");
  return { ok: true as const };
}

// ---------- Production rates & assemblies ----------

const crewSchema = z.object({
  labor: z.array(z.object({ laborRoleId: z.string(), count: z.number().positive() })),
  equipment: z.array(z.object({ equipmentId: z.string(), count: z.number().positive() })),
});
const prodSchema = z.object({
  activity: z.string().trim().min(1), unit: z.string().trim().min(1),
  outputPerDay: z.number().positive().nullable(), hoursPerDay: z.number().positive().max(24),
  crew: crewSchema, notes: z.string().nullable(), verified: z.boolean(),
});

async function assertOwned(db: Awaited<ReturnType<typeof requireCtx>>["db"], crew: z.infer<typeof crewSchema>) {
  const lr = crew.labor.map((l) => l.laborRoleId), eq = crew.equipment.map((e) => e.equipmentId);
  const [a, b] = await Promise.all([db.laborRole.count({ where: { id: { in: lr } } }), db.equipment.count({ where: { id: { in: eq } } })]);
  if (a !== new Set(lr).size || b !== new Set(eq).size) throw new Error("Crew references unknown labor or equipment");
}

export async function saveProductionRate(id: string | null, data: unknown) {
  const { db } = await requireAdminCtx();
  const parsed = prodSchema.safeParse(data);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues.map((i) => i.message).join("; ") };
  await assertOwned(db, parsed.data.crew);
  const row = id ? await db.productionRate.update({ where: { id }, data: parsed.data }) : await db.productionRate.create({ data: parsed.data as any });
  revalidatePath("/setup/production");
  return { ok: true as const, id: row.id };
}

const asmSchema = z.object({
  name: z.string().trim().min(1), unit: z.string().trim().min(1), description: z.string().nullable(),
  productionRateId: z.string().nullable(),
  materials: z.array(z.object({ materialId: z.string(), qtyPerUnit: z.number().nonnegative(), unit: z.string().nullable().optional(), note: z.string().nullable().optional() })),
});

export async function saveAssembly(id: string | null, data: unknown) {
  const { db } = await requireAdminCtx();
  const parsed = asmSchema.safeParse(data);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues.map((i) => i.message).join("; ") };
  const d = parsed.data;
  if (d.productionRateId && !(await db.productionRate.findUnique({ where: { id: d.productionRateId } }))) return { ok: false as const, error: "Unknown production rate" };
  const matIds = [...new Set(d.materials.map((m) => m.materialId))];
  if ((await db.material.count({ where: { id: { in: matIds } } })) !== matIds.length) return { ok: false as const, error: "Unknown material" };
  const row = id ? await db.assembly.update({ where: { id }, data: d }) : await db.assembly.create({ data: d as any });
  revalidatePath("/setup/assemblies");
  return { ok: true as const, id: row.id };
}

export async function duplicateAssembly(id: string) {
  const { db } = await requireAdminCtx();
  const a = await db.assembly.findUnique({ where: { id } });
  if (!a) return;
  await db.assembly.create({ data: { name: `${a.name} (copy)`, unit: a.unit, description: a.description, productionRateId: a.productionRateId, materials: a.materials as any } as any });
  revalidatePath("/setup/assemblies");
}

export async function deleteSetupRecord(kind: "productionRate" | "assembly", id: string) {
  const { db } = await requireAdminCtx();
  if (kind === "productionRate") await db.productionRate.deleteMany({ where: { id } });
  else await db.assembly.deleteMany({ where: { id } });
  revalidatePath("/setup");
}

// ---------- Soils ----------

/** Loads textbook starting values, all marked UNVERIFIED until the company confirms them. */
export async function addStarterSoils() {
  const { db } = await requireAdminCtx();
  const starters = [
    { name: "Sand / gravel (dry)", swellPct: 12, shrinkPct: 10 },
    { name: "Common earth / loam", swellPct: 25, shrinkPct: 10 },
    { name: "Clay", swellPct: 35, shrinkPct: 15 },
    { name: "Rock (blasted)", swellPct: 60, shrinkPct: -30 },
  ];
  await db.soilType.createMany({
    data: starters.map((s) => ({ ...s, verified: false, notes: "Textbook starting value. Replace with your own before relying on it." })) as any,
  });
  revalidatePath("/setup/soils");
}

// ---------- Supplier bulk import ----------

export async function importSuppliers(formData: FormData) {
  const { db } = await requireAdminCtx();
  const file = formData.get("file") as File | null;
  const kind = formData.get("kind") === "SUBCONTRACTOR" ? "SUBCONTRACTOR" : "SUPPLIER";
  if (!file) return { ok: false, error: "Choose a CSV or Excel file" };
  let rows: Record<string, string>[] = [];
  const buf = Buffer.from(await file.arrayBuffer());
  if (/\.xlsx$/i.test(file.name)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const ws = wb.worksheets[0];
    const headers: string[] = [];
    ws.getRow(1).eachCell((c, i) => { headers[i] = String(c.value ?? "").trim(); });
    ws.eachRow((r, n) => {
      if (n === 1) return;
      const o: Record<string, string> = {};
      headers.forEach((h, i) => { if (h) o[h] = String(r.getCell(i).text ?? "").trim(); });
      rows.push(o);
    });
  } else {
    rows = Papa.parse<Record<string, string>>(buf.toString("utf8"), { header: true, skipEmptyLines: true }).data;
  }
  const pick = (o: Record<string, string>, ...names: string[]) => {
    const k = Object.keys(o).find((k) => names.some((n) => k.toLowerCase().replace(/[^a-z]/g, "").includes(n)));
    return k ? (o[k] ?? "").trim() : "";
  };
  const cats = await db.supplierCategory.findMany();
  let created = 0;
  for (const r of rows) {
    const name = pick(r, "company", "supplier", "name");
    if (!name) continue;
    const catText = pick(r, "categor", "supplies", "trade");
    const categories = catText.split(/[;,|]/).map((c) => c.trim()).filter(Boolean)
      .map((c) => cats.find((x) => x.code.toLowerCase() === c.toLowerCase() || x.name.toLowerCase() === c.toLowerCase())?.code ?? null)
      .filter((x): x is string => !!x);
    const sup = await db.supplier.create({
      data: { kind, name, categories, serviceArea: pick(r, "area", "region", "service") || null, preferred: /^(y|yes|true|1)$/i.test(pick(r, "prefer")), notes: pick(r, "note") || null } as any,
    });
    const contact = pick(r, "contact", "person");
    const email = pick(r, "email");
    const phone = pick(r, "phone");
    if (contact || email || phone) {
      await db.contact.create({ data: { supplierId: sup.id, name: contact || name, email: email || null, phone: phone || null, isPrimary: true } as any });
    }
    created++;
  }
  revalidatePath("/setup/suppliers");
  return { ok: true, created };
}

// ---------- Users ----------

const userSchema = z.object({
  name: z.string().trim().min(1), email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().optional(), role: z.enum(["ADMIN", "ESTIMATOR"]), password: z.string().min(10, "Password must be at least 10 characters"),
});

export async function createUser(formData: FormData) {
  const { company } = await requireAdminCtx();
  const parsed = userSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  try {
    await prisma.user.create({ data: { companyId: company.id, name: d.name, email: d.email, phone: d.phone || null, role: d.role, passwordHash: await hashPassword(d.password) } });
  } catch {
    return { ok: false, error: "That email is already on your team" };
  }
  revalidatePath("/setup/users");
  return { ok: true };
}

export async function setUserRole(userId: string, role: "ADMIN" | "ESTIMATOR") {
  const { company, user } = await requireAdminCtx();
  if (userId === user.id) return { ok: false, error: "You can't change your own role" };
  await prisma.user.updateMany({ where: { id: userId, companyId: company.id }, data: { role } });
  revalidatePath("/setup/users");
  return { ok: true };
}
