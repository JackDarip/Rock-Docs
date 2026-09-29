import { requireCtx } from "@/lib/auth";
import { orderQty } from "@/lib/estimate";
import { Card, ButtonLink, fmtNum } from "@/components/ui";
import { EditableTable } from "@/components/EditableTable";
import { RebuildMaterials } from "@/components/RebuildButton";

export default async function Materials({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireCtx();
  const [lines, cats] = await Promise.all([
    db.materialLine.findMany({ where: { projectId: id }, orderBy: [{ categoryCode: "asc" }, { sortOrder: "asc" }] }),
    db.supplierCategory.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  return (
    <div className="space-y-6">
      <Card title="Consolidated material list" actions={<div className="flex gap-2"><RebuildMaterials projectId={id} /><ButtonLink href={`/projects/${id}/rfqs`} variant="secondary">Get prices →</ButtonLink></div>}>
        <p className="mb-3 text-sm text-muted">Built from confirmed quantities × each assembly&apos;s material per unit, converted with your densities and combined across bid items. Edit anything before sending; add lines by hand (they&apos;re kept when you rebuild). Tick &quot;Exclude&quot; to leave a line off RFQs.</p>
        <EditableTable entity="materialLine" projectId={id} rows={lines} addLabel="Add material line"
          emptyHint="Empty. Confirm quantities and map bid items to assemblies, then click Rebuild from estimate."
          columns={[
            { key: "description", label: "Material", required: true, width: "26%" },
            { key: "quantity", label: "Net qty", type: "number" },
            { key: "unit", label: "Unit", required: true, width: "70px" },
            { key: "wastePct", label: "Waste", type: "pct", term: "waste" },
            { key: "categoryCode", label: "RFQ category", type: "select", options: cats.map((c) => ({ value: c.code, label: c.name })) },
            { key: "specRequirement", label: "Spec requirement" },
            { key: "specSection", label: "Spec section", width: "100px" },
            { key: "excluded", label: "Exclude", type: "checkbox" },
          ]} />
      </Card>
      {lines.length > 0 && (
        <Card title="Where each material is used">
          <table className="tbl">
            <thead><tr><th>Material</th><th className="text-right">Order qty (with waste)</th><th>Used by bid items</th></tr></thead>
            <tbody>{lines.map((l) => (
              <tr key={l.id}>
                <td>{l.description} {l.manual && <span className="flag flag-muted">manual</span>}</td>
                <td className="text-right">{fmtNum(orderQty(l), 2)} {l.unit}</td>
                <td className="text-xs text-muted">{((l.bidItemRefs ?? []) as { itemNumber: string; qty: number }[]).map((r) => `#${r.itemNumber} (${fmtNum(r.qty, 2)})`).join(", ") || "—"}</td>
              </tr>))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
