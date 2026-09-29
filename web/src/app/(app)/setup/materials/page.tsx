import { requireCtx } from "@/lib/auth";
import { PageHeader, Card, Term, Flag } from "@/components/ui";
import { EditableTable } from "@/components/EditableTable";
import { StepNav } from "@/components/StepNav";

export default async function MaterialsStep() {
  const { db, isAdmin, company } = await requireCtx();
  const [rows, cats, sups] = await Promise.all([
    db.material.findMany({ orderBy: { name: "asc" } }),
    db.supplierCategory.findMany({ where: { kind: "SUPPLIER" }, orderBy: { sortOrder: "asc" } }),
    db.supplier.findMany({ where: { kind: "SUPPLIER" }, orderBy: { name: "asc" } }),
  ]);
  const cutoff = Date.now() - company.quoteExpiryDays * 864e5;
  const stale = rows.filter((r) => r.unitCost != null && (!r.lastQuotedAt || r.lastQuotedAt.getTime() < cutoff));
  return (
    <>
      <PageHeader eyebrow="Step 4 of 9" title="Materials"
        subtitle={<>Everything you buy, in the unit your supplier sells it. Add a <Term k="density">density</Term> for anything measured in CY on plans but bought by the ton, and a <Term k="waste">waste %</Term>.</>} />
      {stale.length > 0 && (
        <div className="mb-4 rounded-xl border border-warn-line bg-warn-bg p-3 text-sm text-warn">
          ⚠ {stale.length} price{stale.length > 1 ? "s are" : " is"} older than {company.quoteExpiryDays} days: {stale.slice(0, 6).map((s) => s.name).join(", ")}{stale.length > 6 ? "…" : ""}. Estimates will flag them as unquoted until refreshed.
        </div>
      )}
      <Card>
        <EditableTable entity="material" readOnly={!isAdmin} rows={rows} addLabel="Add material"
          emptyHint="No materials yet. Add aggregates, pipe, fittings, concrete, asphalt…"
          flagRow={{ key: "unitCost", equals: null, label: "No price" }}
          columns={[
            { key: "name", label: "Material", required: true, width: "20%", placeholder: "e.g. 3/4\" crushed base" },
            { key: "unit", label: "Unit", required: true, width: "70px", placeholder: "TON" },
            { key: "unitCost", label: "Unit cost", type: "money" },
            { key: "lastQuotedAt", label: "Last quoted", type: "date" },
            { key: "categoryCode", label: "RFQ category", type: "select", options: cats.map((c) => ({ value: c.code, label: c.name })) },
            { key: "supplierId", label: "Usual supplier", type: "select", options: sups.map((s) => ({ value: s.id, label: s.name })) },
            { key: "densityTonsPerCy", label: "Tons / CY", type: "number", term: "density" },
            { key: "wastePct", label: "Waste", type: "pct", term: "waste" },
            { key: "specNotes", label: "Spec notes" },
          ]} />
        <p className="mt-3 text-xs text-muted"><Flag tone="info">Tip</Flag> Prices update automatically when you accept supplier quotes on a bid (with your approval), and every change is kept in price history.</p>
      </Card>
      <StepNav current="materials" />
    </>
  );
}
