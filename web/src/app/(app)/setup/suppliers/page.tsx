import { requireCtx } from "@/lib/auth";
import { PageHeader, Card, Tabs } from "@/components/ui";
import { EditableTable } from "@/components/EditableTable";
import { StepNav } from "@/components/StepNav";
import { ImportForm } from "@/components/ImportForm";

export default async function SuppliersStep({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind: k } = await searchParams;
  const kind = k === "SUBCONTRACTOR" ? "SUBCONTRACTOR" : "SUPPLIER";
  const { db, isAdmin } = await requireCtx();
  const [sups, cats, contacts] = await Promise.all([
    db.supplier.findMany({ where: { kind }, orderBy: [{ preferred: "desc" }, { name: "asc" }] }),
    db.supplierCategory.findMany({ where: { kind }, orderBy: { sortOrder: "asc" } }),
    db.contact.findMany({ orderBy: { name: "asc" } }),
  ]);
  const supIds = new Set(sups.map((s) => s.id));
  const noun = kind === "SUPPLIER" ? "supplier" : "subcontractor";
  return (
    <>
      <PageHeader eyebrow="Step 5 of 9" title="Suppliers & subcontractors"
        subtitle="Your directory for RFQs. Categories decide which RFQ each supplier is suggested for; service area helps pick the right yard for the job." />
      <Tabs active={`/setup/suppliers?kind=${kind}`} tabs={[{ href: "/setup/suppliers?kind=SUPPLIER", label: "Suppliers" }, { href: "/setup/suppliers?kind=SUBCONTRACTOR", label: "Subcontractors" }]} />
      <Card title={`${kind === "SUPPLIER" ? "Suppliers" : "Subcontractors"}`} className="mb-6"
        actions={isAdmin && <ImportForm kind={kind} />}>
        <EditableTable key={`s-${kind}`} entity="supplier" readOnly={!isAdmin} rows={sups} defaults={{ kind }} addLabel={`Add ${noun}`}
          emptyHint={`No ${noun}s yet. Add them one at a time, or import a CSV/Excel file (columns: Company, Categories, Contact, Email, Phone, Service area, Preferred, Notes).`}
          columns={[
            { key: "name", label: "Company", required: true, width: "22%" },
            { key: "categories", label: `Categories (codes: ${cats.map((c) => c.code).join(", ")})`, type: "list", width: "24%" },
            { key: "serviceArea", label: "Service area" },
            { key: "preferred", label: "Preferred", type: "checkbox" },
            { key: "notes", label: "Notes" },
          ]} />
      </Card>
      <Card title="Contacts" className="mb-6">
        <EditableTable key={`c-${kind}`} entity="contact" readOnly={!isAdmin} rows={contacts.filter((c) => supIds.has(c.supplierId))} addLabel="Add contact"
          emptyHint={`Add the people you send RFQs to at each ${noun}.`}
          columns={[
            { key: "supplierId", label: "Company", type: "select", required: true, options: sups.map((s) => ({ value: s.id, label: s.name })), width: "22%" },
            { key: "name", label: "Name", required: true },
            { key: "title", label: "Title" },
            { key: "email", label: "Email" },
            { key: "phone", label: "Phone" },
            { key: "isPrimary", label: "Primary", type: "checkbox" },
          ]} />
      </Card>
      <Card title="Categories">
        <p className="mb-3 text-sm text-muted">Each category becomes its own RFQ. The short code appears in RFQ numbers (e.g. AGG in IR-2026-0142-AGG-R0). Add custom categories anytime.</p>
        <EditableTable key={`g-${kind}`} entity="supplierCategory" readOnly={!isAdmin} rows={cats} defaults={{ kind }} addLabel="Add category"
          columns={[{ key: "code", label: "Code", required: true, width: "120px" }, { key: "name", label: "Name", required: true }]} />
      </Card>
      <StepNav current="suppliers" />
    </>
  );
}
