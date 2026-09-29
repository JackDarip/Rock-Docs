import { apiCtx, contentDisposition, notFound, unauthorized } from "@/lib/apictx";
import { buildRfqCsv, buildRfqPdf, buildRfqXlsx, rfqFileName } from "@/lib/rfq";
import { rfqHeader, rfqLines } from "@/lib/rfqdata";

const TYPES = { xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pdf: "application/pdf", csv: "text/csv" } as const;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiCtx();
  if (!ctx) return unauthorized();
  const { id } = await params;
  const rfq = await ctx.db.rfq.findUnique({ where: { id } });
  if (!rfq) return notFound();
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "xlsx") as keyof typeof TYPES;
  if (!(format in TYPES)) return new Response("Unknown format", { status: 400 });
  const supplierId = url.searchParams.get("supplierId");
  const h = await rfqHeader(ctx.db, ctx.company, rfq, supplierId);
  const lines = rfqLines(rfq);
  const buf = format === "xlsx" ? await buildRfqXlsx(h, lines) : format === "pdf" ? await buildRfqPdf(h, lines) : buildRfqCsv(h, lines);
  await ctx.db.rfqDownload.create({ data: { rfqId: rfq.id, userId: ctx.user.id, format, revision: rfq.revision, supplierId, contentHash: rfq.contentHash } as any });
  return new Response(new Uint8Array(buf), {
    headers: { "content-type": TYPES[format], "content-disposition": contentDisposition(rfqFileName(rfq.number, h.categoryName, rfq.revision, format, h.supplier?.name)) },
  });
}
