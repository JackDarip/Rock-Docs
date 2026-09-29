import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { Card, Flag, fmtMoney } from "@/components/ui";
import { EditableTable } from "@/components/EditableTable";
import { QuoteHeader } from "@/components/QuoteReview";
import { AutoRefresh } from "@/components/AutoRefresh";

export default async function QuoteReviewPage({ params }: { params: Promise<{ id: string; quoteId: string }> }) {
  const { id, quoteId } = await params;
  const { db } = await requireCtx();
  const quote = await db.quote.findFirst({ where: { id: quoteId, projectId: id } });
  if (!quote) notFound();
  const [lines, matLines, suppliers, doc, running, rfq] = await Promise.all([
    db.quoteLine.findMany({ where: { quoteId }, orderBy: { sortOrder: "asc" } }),
    db.materialLine.findMany({ where: { projectId: id }, orderBy: [{ categoryCode: "asc" }, { sortOrder: "asc" }] }),
    db.supplier.findMany({ where: { kind: "SUPPLIER" }, orderBy: { name: "asc" } }),
    quote.documentId ? db.document.findUnique({ where: { id: quote.documentId } }) : null,
    db.job.count({ where: { type: "EXTRACT_QUOTE", status: { in: ["QUEUED", "RUNNING"] } } }),
    quote.rfqId ? db.rfq.findUnique({ where: { id: quote.rfqId } }) : null,
  ]);
  const low = lines.filter((l) => l.confidence === "LOW" || !l.materialLineId).length;
  const total = lines.reduce((s, l) => s + (l.extended ?? 0), 0);
  const sections = [...new Set(lines.map((l) => l.section ?? "—"))];
  return (
    <div className="space-y-6">
      <AutoRefresh active={running > 0 && lines.length === 0} />
      <div className="flex items-center justify-between">
        <Link href={`/projects/${id}/quotes`} className="text-sm text-navy-700">← All quotes</Link>
        {doc && <a className="btn btn-secondary btn-sm" href={`/api/files/${doc.id}?inline=1`} target="_blank">Open the supplier&apos;s original ({doc.filename})</a>}
      </div>
      <Card title={`Quote review${quote.supplierName ? `: ${quote.supplierName}` : ""}`}>
        <div className="mb-4 text-sm text-muted">
          {quote.source === "PDF" && <><Flag>AI extracted</Flag> Every line was read by AI from the supplier&apos;s document. Check prices against the original before confirming. </>}
          {rfq && <>Matched to RFQ <strong>{rfq.number}</strong> (revision {quote.rfqRevision ?? rfq.revision}). </>}
          {quote.source === "XLSX" && !rfq && <Flag>No RFQ number found</Flag>}
        </div>
        <QuoteHeader projectId={id} suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))} quote={JSON.parse(JSON.stringify(quote))} />
      </Card>
      <Card title={`Lines (${lines.length})`} actions={<span className="text-sm text-muted">Quote total {fmtMoney(total)} · {low} line{low === 1 ? "" : "s"} need a match or check</span>}>
        {running > 0 && lines.length === 0 ? <p className="text-sm text-navy-700">Reading the supplier&apos;s quote… lines will appear here.</p> : (
          <>
            <p className="mb-3 text-sm text-muted">Map each quoted line to a line on your material list so it can be compared and used. Lines left unmatched still count toward this supplier&apos;s section totals{sections.length > 1 ? ` (${sections.length} sections, e.g. owner bid items)` : ""}.</p>
            <EditableTable entity="quoteLine" rows={lines} defaults={{ quoteId }} addLabel="Add line"
              flagRow={{ key: "materialLineId", equals: null, label: "Unmatched" }}
              columns={[
                { key: "section", label: "Section", width: "14%" },
                { key: "description", label: "Supplier's description", required: true, width: "26%" },
                { key: "quantity", label: "Qty", type: "number" },
                { key: "unit", label: "Unit", width: "60px" },
                { key: "unitPrice", label: "Unit price", type: "money" },
                { key: "extended", label: "Extended", type: "money" },
                { key: "materialLineId", label: "Matches your material", type: "select", options: matLines.map((m) => ({ value: m.id, label: `${m.description} (${m.unit})` })), width: "20%" },
                { key: "isAlternate", label: "Alt.", type: "checkbox" },
                { key: "notes", label: "Notes" },
              ]} />
          </>
        )}
      </Card>
    </div>
  );
}
