import JSZip from "jszip";
import { apiCtx, contentDisposition, notFound, unauthorized } from "@/lib/apictx";
import { buildRfqPdf, buildRfqXlsx, rfqFileName } from "@/lib/rfq";
import { rfqHeader, rfqLines } from "@/lib/rfqdata";

/** "Download all": every current category RFQ for the job in one .zip. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiCtx();
  if (!ctx) return unauthorized();
  const { id } = await params;
  const project = await ctx.db.project.findUnique({ where: { id } });
  if (!project) return notFound();
  const rfqs = await ctx.db.rfq.findMany({ where: { projectId: id, superseded: false }, orderBy: { categoryCode: "asc" } });
  const zip = new JSZip();
  for (const rfq of rfqs) {
    const h = await rfqHeader(ctx.db, ctx.company, rfq);
    zip.file(rfqFileName(rfq.number, h.categoryName, rfq.revision, "xlsx"), await buildRfqXlsx(h, rfqLines(rfq)));
    zip.file(`PDF/${rfqFileName(rfq.number, h.categoryName, rfq.revision, "pdf")}`, await buildRfqPdf(h, rfqLines(rfq)));
    await ctx.db.rfqDownload.create({ data: { rfqId: rfq.id, userId: ctx.user.id, format: "zip", revision: rfq.revision, contentHash: rfq.contentHash } as any });
  }
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  return new Response(new Uint8Array(buf), {
    headers: { "content-type": "application/zip", "content-disposition": contentDisposition(`${ctx.company.rfqPrefix}-${project.jobNumber} - RFQs.zip`) },
  });
}
