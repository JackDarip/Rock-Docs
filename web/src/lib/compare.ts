import type { TenantDb } from "./db";
import { orderQty } from "./estimate";

export type CompareCell = { quoteLineId: string; unitPrice: number | null; extended: number | null; isAlternate: boolean; notes: string | null; selected: boolean; leadTime: string | null } | null;

/** Side-by-side material × supplier matrix for confirmed quotes, with flags. */
export async function loadComparison(db: TenantDb, projectId: string) {
  const [lines, quotes, rfqs] = await Promise.all([
    db.materialLine.findMany({ where: { projectId, excluded: false }, orderBy: [{ categoryCode: "asc" }, { sortOrder: "asc" }] }),
    db.quote.findMany({ where: { projectId, status: "CONFIRMED" }, orderBy: { createdAt: "asc" } }),
    db.rfq.findMany({ where: { projectId } }),
  ]);
  const qLines = quotes.length ? await db.quoteLine.findMany({ where: { quoteId: { in: quotes.map((q) => q.id) } } }) : [];
  const now = new Date();
  const rows = lines.map((line) => {
    const cells: CompareCell[] = quotes.map((q) => {
      const ql = qLines.find((x) => x.quoteId === q.id && x.materialLineId === line.id);
      return ql ? { quoteLineId: ql.id, unitPrice: ql.unitPrice, extended: ql.extended, isAlternate: ql.isAlternate, notes: ql.notes, selected: line.selectedQuoteLineId === ql.id, leadTime: ql.leadTime } : null;
    });
    const valid = cells.filter((c) => c?.unitPrice != null && !c.isAlternate).map((c) => c!.unitPrice!);
    return { line, orderQty: orderQty(line), cells, low: valid.length ? Math.min(...valid) : null };
  });
  const quoteInfo = quotes.map((q) => {
    const rfq = q.rfqId ? rfqs.find((r) => r.id === q.rfqId) : null;
    const latest = rfq ? rfqs.filter((r) => r.categoryCode === rfq.categoryCode).sort((a, b) => b.revision - a.revision)[0] : null;
    const covered = rows.filter((r) => r.cells[quotes.indexOf(q)]?.unitPrice != null).length;
    const sectionTotals = new Map<string, number>();
    for (const l of qLines.filter((x) => x.quoteId === q.id)) sectionTotals.set(l.section ?? "Unsectioned", (sectionTotals.get(l.section ?? "Unsectioned") ?? 0) + (l.extended ?? 0));
    return {
      ...q, covered, missing: rows.length - covered,
      expired: q.validUntil ? q.validUntil < now : false,
      outdatedRevision: rfq && latest && latest.revision > (q.rfqRevision ?? rfq.revision) ? `Priced against R${q.rfqRevision ?? rfq.revision}; current is R${latest.revision}` : null,
      total: qLines.filter((x) => x.quoteId === q.id).reduce((s, x) => s + (x.extended ?? 0), 0),
      sectionTotals: [...sectionTotals.entries()],
    };
  });
  return { rows, quotes: quoteInfo };
}
