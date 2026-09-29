import "server-only";
import type { TenantDb } from "./db";
import { prisma } from "./db";
import type { RfqHeader, RfqLine } from "./rfq";

export async function categoryNames(db: TenantDb) {
  const cats = await db.supplierCategory.findMany();
  const m = new Map(cats.map((c) => [c.code, c.name]));
  m.set("ALL", "All materials (master)");
  m.set("MISC", "Other materials");
  return m;
}

export async function rfqHeader(db: TenantDb, company: RfqHeader["company"], rfq: { number: string; revision: number; categoryCode: string; projectId: string }, supplierId?: string | null): Promise<RfqHeader> {
  const project = await db.project.findUniqueOrThrow({ where: { id: rfq.projectId } });
  const est = project.estimatorId ? await prisma.user.findFirst({ where: { id: project.estimatorId, companyId: company.id } }) : null;
  const addenda = await db.document.findMany({ where: { projectId: project.id, kind: "ADDENDUM" }, orderBy: { addendumNumber: "asc" } });
  const cats = await categoryNames(db);
  let supplier: RfqHeader["supplier"] = null;
  if (supplierId) {
    const s = await db.supplier.findUnique({ where: { id: supplierId }, include: { contacts: true } });
    if (s) {
      const c = s.contacts.find((x) => x.isPrimary) ?? s.contacts[0];
      supplier = { name: s.name, contact: c ? [c.name, c.email, c.phone].filter(Boolean).join(", ") : "" };
    }
  }
  return {
    number: rfq.number, revision: rfq.revision, categoryName: cats.get(rfq.categoryCode) ?? rfq.categoryCode,
    company, project: { ...project },
    estimator: { name: est?.name ?? "", email: est?.email ?? "", phone: est?.phone ?? null },
    addenda: addenda.map((a) => `#${a.addendumNumber ?? "?"}`).join(", "),
    supplier,
  };
}

export const rfqLines = (rfq: { lines: unknown }) => (rfq.lines ?? []) as RfqLine[];

/** Fill the company's email template placeholders. */
export function fillTemplate(tpl: string | null, v: Record<string, string>) {
  return (tpl ?? "").replace(/\{(\w+)\}/g, (_, k) => v[k] ?? `{${k}}`);
}
