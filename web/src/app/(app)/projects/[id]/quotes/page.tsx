import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { Card, Flag, fmtDate, fmtMoney } from "@/components/ui";
import { QuoteUpload } from "@/components/QuoteUpload";
import { AutoRefresh } from "@/components/AutoRefresh";

const SOURCE: Record<string, string> = { XLSX: "Returned spreadsheet", PDF: "Supplier's own quote (PDF)", FORM: "Online quote form", EMAIL: "Email text" };

export default async function Quotes({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireCtx();
  const [quotes, suppliers, running] = await Promise.all([
    db.quote.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" } }),
    db.supplier.findMany({ where: { kind: "SUPPLIER" }, orderBy: { name: "asc" } }),
    db.job.count({ where: { type: "EXTRACT_QUOTE", status: { in: ["QUEUED", "RUNNING"] } } }),
  ]);
  const lines = quotes.length ? await db.quoteLine.findMany({ where: { quoteId: { in: quotes.map((q) => q.id) } } }) : [];
  const failed = await db.job.findMany({ where: { type: "EXTRACT_QUOTE", status: "FAILED" }, orderBy: { createdAt: "desc" }, take: 5 });
  const now = new Date();
  return (
    <div className="space-y-6">
      <AutoRefresh active={running > 0} />
      <QuoteUpload projectId={id} suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))} />
      {running > 0 && <p className="text-sm text-navy-700">Reading {running} supplier quote{running > 1 ? "s" : ""} with AI… this page refreshes itself.</p>}
      {failed.filter((f) => quotes.some((q) => q.id === (f.payload as any)?.quoteId)).map((f) => <p key={f.id} className="text-sm text-warn">⚠ A quote couldn&apos;t be read: {f.error}</p>)}
      <Card title="Quotes received">
        {quotes.length === 0 ? <p className="text-sm text-muted">No quotes yet. They can come back as filled spreadsheets, suppliers&apos; own PDFs, or through the online quote form link.</p> : (
          <table className="tbl">
            <thead><tr><th>Supplier</th><th>How it came in</th><th>Lines</th><th>Matched</th><th className="text-right">Total</th><th>Valid until</th><th>Status</th><th /></tr></thead>
            <tbody>
              {quotes.map((q) => {
                const ql = lines.filter((l) => l.quoteId === q.id);
                const matched = ql.filter((l) => l.materialLineId).length;
                const total = ql.reduce((s, l) => s + (l.extended ?? 0), 0);
                const expired = q.validUntil && q.validUntil < now;
                return (
                  <tr key={q.id}>
                    <td className="font-semibold">{q.supplierName ?? <Flag>Which supplier?</Flag>}</td>
                    <td className="text-sm">{SOURCE[q.source] ?? q.source}{q.quoteNumber ? <div className="text-xs text-muted">#{q.quoteNumber}</div> : null}</td>
                    <td>{ql.length}</td>
                    <td>{ql.length ? `${matched} of ${ql.length}` : "—"}</td>
                    <td className="text-right">{fmtMoney(total)}</td>
                    <td>{q.validUntil ? (expired ? <Flag>Expired {fmtDate(q.validUntil)}</Flag> : fmtDate(q.validUntil)) : "—"}</td>
                    <td>{q.status === "CONFIRMED" ? <Flag tone="ok">Confirmed</Flag> : <Flag>Needs review</Flag>}</td>
                    <td className="text-right"><Link className="btn btn-secondary btn-sm" href={`/projects/${id}/quotes/${q.id}`}>{q.status === "CONFIRMED" ? "Open" : "Review"}</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
