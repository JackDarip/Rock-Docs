import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { Card, Flag, AiBadge, Term, fmtNum, ButtonLink } from "@/components/ui";
import { EditableTable } from "@/components/EditableTable";
import { BidScheduleImport } from "@/components/BidScheduleImport";
import { TakeoffApply } from "@/components/TakeoffApply";
import { PRODUCT_NAME } from "@/config/brand";

const SOURCE: Record<string, string> = { BID_SCHEDULE: "Owner bid schedule", TABULATED: "Table on plans", AI_MEASURE: "AI measurement", MANUAL: "Manual / your takeoff", LANDXML: "LandXML surfaces" };

export default async function BidItems({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, company } = await requireCtx();
  const [items, markups, docs] = await Promise.all([
    db.bidItem.findMany({ where: { projectId: id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.takeoffMarkup.findMany({ where: { projectId: id } }),
    db.document.findMany({ where: { projectId: id }, select: { id: true, filename: true } }),
  ]);
  const docName = (d: string | null) => docs.find((x) => x.id === d)?.filename ?? "";
  return (
    <div className="space-y-6">
      <Card title={<>Owner&apos;s <Term k="biditem">bid items</Term></>} actions={<ButtonLink href={`/projects/${id}/viewer`} variant="secondary">Open plan viewer</ButtonLink>}>
        <p className="mb-3 text-sm text-muted">
          Three ways in: extract from the bid schedule PDF (Plan room → Extract bid schedule), import an Excel/CSV bid form, or type them in.
          When there&apos;s an owner schedule, your estimate is organized by these items so the bid maps 1:1 to the bid form. New and imported items are drafts until confirmed under Review.
        </p>
        <div className="mb-4"><BidScheduleImport projectId={id} /></div>
        <EditableTable entity="bidItem" projectId={id} rows={items} addLabel="Add bid item" defaults={{ source: "MANUAL" }}
          emptyHint="No bid items yet. If the owner didn't issue a schedule, add your own items; they'll be grouped under Project Setup, Earthwork, Wet Utilities, Paving & Concrete, Structures, and Indirect Costs."
          flagRow={{ key: "status", equals: "DRAFT", label: "Needs review" }}
          columns={[
            { key: "itemNumber", label: "Item #", required: true, width: "80px" },
            { key: "description", label: "Description", required: true, width: "34%" },
            { key: "unit", label: "Unit", required: true, width: "70px" },
            { key: "quantity", label: "Owner qty", type: "number" },
            { key: "specSection", label: "Spec section", width: "110px" },
            { key: "specRequirement", label: "Material requirement (from specs)" },
            { key: "section", label: "Section", type: "select", options: ["Project Setup", "Earthwork", "Wet Utilities", "Paving & Concrete", "Structures", "Indirect Costs"].map((s) => ({ value: s, label: s })) },
          ]} />
      </Card>

      <Card title="Traceability & takeoff check">
        <p className="mb-3 text-sm text-muted">Every quantity links back to where it came from. Your takeoff is compared with the owner&apos;s quantity and flagged when they differ by more than {company.takeoffVariancePct}%.</p>
        <table className="tbl">
          <thead><tr><th>Item</th><th>Description</th><th>Source</th><th className="text-right">Owner qty</th><th className="text-right">Your takeoff</th><th>Difference</th><th /></tr></thead>
          <tbody>
            {items.map((b) => {
              const mk = markups.filter((m) => m.bidItemId === b.id);
              const take = mk.reduce((s, m) => s + m.quantity, 0);
              const diff = mk.length && b.quantity ? ((take - b.quantity) / b.quantity) * 100 : null;
              const flagged = diff != null && Math.abs(diff) > company.takeoffVariancePct;
              return (
                <tr key={b.id} className={flagged ? "row-warn" : ""}>
                  <td className="font-mono text-xs">{b.itemNumber}</td>
                  <td>{b.description}</td>
                  <td className="text-xs">
                    <div>{SOURCE[b.source] ?? b.source} {b.aiExtracted && b.status === "DRAFT" && <AiBadge />} {b.confidence === "LOW" && <Flag>Low confidence</Flag>}</div>
                    {b.documentId && <Link className="text-navy-700 hover:underline" href={`/projects/${id}/viewer?doc=${b.documentId}&page=${(b.pageIndex ?? 0) + 1}`}>{docName(b.documentId)} p.{(b.pageIndex ?? 0) + 1}</Link>}
                    {b.sourceNote && <div className="text-muted">{b.sourceNote}</div>}
                  </td>
                  <td className="text-right">{fmtNum(b.quantity, 3)} {b.unit}</td>
                  <td className="text-right">
                    {mk.length ? <Link className="text-navy-700 hover:underline" href={`/projects/${id}/viewer?markup=${mk[0].id}`}>{fmtNum(take, 2)} {mk[0].unit}</Link> : <span className="text-faint">—</span>}
                    {mk.length > 0 && <div className="text-xs text-muted">{mk.length} markup{mk.length > 1 ? "s" : ""}</div>}
                  </td>
                  <td>{diff != null ? (flagged ? <Flag>{diff > 0 ? "+" : ""}{diff.toFixed(1)}%</Flag> : <span className="text-sm text-muted">{diff.toFixed(1)}%</span>) : "—"}</td>
                  <td className="text-right">{mk.length > 0 && <TakeoffApply projectId={id} bidItemId={b.id} qty={take} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted">Earthwork: {PRODUCT_NAME} never computes cut/fill from PDF contours. Use the owner&apos;s quantity, an external earthwork takeoff (enter it with a source note), or LandXML surfaces (import coming in a later phase).</p>
      </Card>
    </div>
  );
}
