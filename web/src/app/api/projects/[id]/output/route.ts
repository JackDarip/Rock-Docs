import { apiCtx, contentDisposition, notFound, unauthorized } from "@/lib/apictx";
import { loadEstimate } from "@/lib/estimate";
import { bidFormPdf, bidFormXlsx, bidSummaryPdf, comparisonXlsx, estimateXlsx } from "@/lib/output";
import { loadComparison } from "@/lib/compare";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiCtx();
  if (!ctx) return unauthorized();
  const { id } = await params;
  const kind = new URL(req.url).searchParams.get("kind");
  const est = await loadEstimate(ctx.db, ctx.company, id);
  if (!est) return notFound();
  const p = est.project;
  const FINAL = ["summary-client", "bidform-xlsx", "bidform-pdf"];
  if (kind && FINAL.includes(kind) && (est.result.blockers.length || !est.result.sections.length)) {
    return new Response(`Final bid output is blocked until every bid item is confirmed and mapped:\n${est.result.blockers.join("\n")}`, { status: 409 });
  }
  const base = `${ctx.company.rfqPrefix}-${p.jobNumber} ${p.name}`;
  const addenda = (await ctx.db.document.findMany({ where: { projectId: id, kind: "ADDENDUM", acknowledged: true } })).map((d) => `#${d.addendumNumber ?? "?"}`).join(", ");
  let buf: Buffer, type: string, name: string;
  switch (kind) {
    case "summary-client": buf = await bidSummaryPdf(ctx.company, p, est.result, "client", addenda); type = "application/pdf"; name = `${base} - Bid Summary.pdf`; break;
    case "summary-internal": buf = await bidSummaryPdf(ctx.company, p, est.result, "internal", addenda); type = "application/pdf"; name = `${base} - Internal Estimate.pdf`; break;
    case "bidform-xlsx": buf = await bidFormXlsx(ctx.company, p, est.result); type = XLSX; name = `${base} - Bid Form.xlsx`; break;
    case "bidform-pdf": buf = await bidFormPdf(ctx.company, p, est.result); type = "application/pdf"; name = `${base} - Bid Form.pdf`; break;
    case "estimate-xlsx": buf = await estimateXlsx(ctx.company, p, est.result); type = XLSX; name = `${base} - Estimate.xlsx`; break;
    case "compare-xlsx": {
      const c = await loadComparison(ctx.db, id);
      buf = await comparisonXlsx(ctx.company, p, c.rows.map((r) => ({ description: r.line.description, unit: r.line.unit, quantity: r.orderQty, prices: r.cells.map((x) => x?.unitPrice ?? null), selected: r.cells.findIndex((x) => x?.selected) >= 0 ? r.cells.findIndex((x) => x?.selected) : null })), c.quotes.map((q) => q.supplierName ?? "Supplier"));
      type = XLSX; name = `${base} - Quote Comparison.xlsx`; break;
    }
    default: return new Response("Unknown output", { status: 400 });
  }
  return new Response(new Uint8Array(buf), { headers: { "content-type": type, "content-disposition": contentDisposition(name) } });
}
