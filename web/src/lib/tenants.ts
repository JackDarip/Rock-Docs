import { prisma } from "./db";
import bcrypt from "bcryptjs";

// Structural defaults only (category names), never rate or price data.
export const DEFAULT_CATEGORIES = [
  { code: "AGG", name: "Aggregates", kind: "SUPPLIER" },
  { code: "PIPE", name: "Pipe & precast", kind: "SUPPLIER" },
  { code: "ASPH", name: "Asphalt", kind: "SUPPLIER" },
  { code: "CONC", name: "Ready-mix concrete", kind: "SUPPLIER" },
  { code: "STL", name: "Rebar & steel", kind: "SUPPLIER" },
  { code: "GEO", name: "Geotextiles & erosion control", kind: "SUPPLIER" },
  { code: "FIT", name: "Fittings & valves", kind: "SUPPLIER" },
  { code: "TRK", name: "Trucking", kind: "SUPPLIER" },
  { code: "RENT", name: "Equipment rental", kind: "SUPPLIER" },
  { code: "STRP", name: "Striping", kind: "SUBCONTRACTOR" },
  { code: "FENC", name: "Fencing", kind: "SUBCONTRACTOR" },
  { code: "ELEC", name: "Electrical", kind: "SUBCONTRACTOR" },
  { code: "TC", name: "Traffic control", kind: "SUBCONTRACTOR" },
];

export async function createTenant(input: {
  name: string; subdomain: string; rfqPrefix: string; accentColor?: string;
  admin: { name: string; email: string; password: string };
}) {
  const subdomain = input.subdomain.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!subdomain) throw new Error("Invalid subdomain");
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: input.name, subdomain, rfqPrefix: input.rfqPrefix.toUpperCase(), accentColor: input.accentColor ?? "#FF6B00",
        rfqSubject: "RFQ {rfq_number}: {category} for {project} (due {due})",
        rfqBody: "Hello,\n\nPlease quote the attached {category} RFQ for {project}. Fill in the unit prices in the yellow cells and send the file back by {due}. Alternates are welcome in the Notes column.\n\nRFQ number: {rfq_number}",
        rfqSignature: "Thanks,\n{estimator}",
      },
    });
    await tx.supplierCategory.createMany({ data: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, companyId: company.id, sortOrder: i })) });
    await tx.user.create({
      data: {
        companyId: company.id, name: input.admin.name, email: input.admin.email.toLowerCase(), role: "ADMIN",
        passwordHash: await bcrypt.hash(input.admin.password, 11),
      },
    });
    return company;
  });
}
