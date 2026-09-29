import { requireCtx } from "@/lib/auth";
import { loadComparison } from "@/lib/compare";
import { Card, EmptyState, ButtonLink, Flag, fmtMoney, fmtNum, fmtDate } from "@/components/ui";
import { PickCell, ClearPick, UseSupplierForAll, ApprovePrices } from "@/components/CompareControls";

export default async function Compare({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, isAdmin, company } = await requireCtx();
  const { rows, quotes } = await loadComparison(db, id);
  const materials = await db.material.findMany();
  if (!quotes.length) {
    return <EmptyState title="Nothing to compare yet" body="Confirmed supplier quotes show up here side by side, with the lowest complete price highlighted." actions={<ButtonLink href={`/projects/${id}/quotes`}>Bring in quotes</ButtonLink>} />;
  }
  const selectedCount = rows.filter((r) => r.cells.some((c) => c?.selected) && r.line.materialId).length;
  const cutoff = Date.now() - company.quoteExpiryDays * 864e5;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {quotes.map((q) => (
          <div key={q.id} className="card p-4">
            <div className="font-semibold">{q.supplierName}</div>
            <div className="font-display text-2xl font-bold">{fmtMoney(q.total, 0)}</div>
            <div className="text-xs text-muted">{q.covered} of {rows.length} of your lines priced{q.validUntil ? ` · valid to ${fmtDate(q.validUntil)}` : ""}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {q.missing > 0 && <Flag>{q.missing} missing</Flag>}
              {q.expired && <Flag>Expired</Flag>}
              {q.outdatedRevision && <Flag title={q.outdatedRevision}>Old RFQ revision</Flag>}
              {q.exclusions && <Flag title={q.exclusions}>Exclusions</Flag>}
              {q.freightIncluded === false && <Flag>Freight extra</Flag>}
              {q.taxIncluded === false && <Flag tone="muted">Tax extra</Flag>}
            </div>
            {q.sectionTotals.length > 1 && (
              <details className="mt-2 text-xs"><summary className="cursor-pointer text-navy-700">Totals by section</summary>
                <ul className="mt-1">{q.sectionTotals.map(([s, v]) => <li key={s} className="flex justify-between gap-2"><span className="truncate">{s}</span><span>{fmtMoney(v, 0)}</span></li>)}</ul>
              </details>
            )}
            <div className="mt-2"><UseSupplierForAll projectId={id} quoteId={q.id} /></div>
          </div>
        ))}
      </div>
      <Card title="Line by line" actions={<div className="flex gap-2">{isAdmin && <ApprovePrices projectId={id} count={selectedCount} />}<a className="btn btn-secondary btn-sm" href={`/api/projects/${id}/output?kind=compare-xlsx`}>Export to Excel</a></div>}>
        <p className="mb-3 text-sm text-muted">Green = lowest complete price (alternates excluded). Pick a price per line; picked prices flow into the estimate labeled with the supplier, quote date and expiry. Lines with no pick use your last known price and are flagged &quot;unquoted.&quot;</p>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Material</th><th className="text-right">Qty</th>{quotes.map((q) => <th key={q.id} className="text-right">{q.supplierName}</th>)}<th>Using</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const picked = r.cells.findIndex((c) => c?.selected);
                const mat = materials.find((m) => m.id === r.line.materialId);
                const stale = !mat?.lastQuotedAt || mat.lastQuotedAt.getTime() < cutoff;
                return (
                  <tr key={r.line.id} className={picked < 0 && r.cells.every((c) => !c) ? "row-warn" : ""}>
                    <td>{r.line.description}{r.line.specRequirement && <div className="text-xs text-muted">{r.line.specRequirement}</div>}</td>
                    <td className="text-right whitespace-nowrap">{fmtNum(r.orderQty)} {r.line.unit}</td>
                    {r.cells.map((c, i) => (
                      <td key={i} className="text-right">
                        {c?.unitPrice != null ? <PickCell projectId={id} materialLineId={r.line.id} quoteLineId={c.quoteLineId} selected={c.selected} alt={c.isAlternate} low={c.unitPrice === r.low && !c.isAlternate} label={fmtMoney(c.unitPrice)} />
                          : <span className="text-xs text-faint">{c ? "no price" : "not quoted"}</span>}
                      </td>
                    ))}
                    <td className="text-xs">
                      {picked >= 0 ? <span>{quotes[picked].supplierName} <ClearPick projectId={id} materialLineId={r.line.id} /></span>
                        : mat?.unitCost != null ? <Flag>Unquoted: company price {fmtMoney(mat.unitCost)}{stale ? " (stale)" : ""}</Flag> : <Flag>No price</Flag>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
