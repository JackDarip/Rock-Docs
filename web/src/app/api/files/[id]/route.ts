import { apiCtx, contentDisposition, notFound, unauthorized } from "@/lib/apictx";
import { storage } from "@/lib/storage";

// Serves an uploaded document. The lookup goes through the tenant-scoped
// client, so another company's document ID is simply "not found". Supports
// HTTP Range so the plan viewer can stream large plan sets.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiCtx();
  if (!ctx) return unauthorized();
  const { id } = await params;
  const doc = await ctx.db.document.findUnique({ where: { id } });
  if (!doc) return notFound();
  const size = await storage.size(ctx.company.id, doc.storageKey);
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  const headers: Record<string, string> = {
    "content-type": doc.mime || "application/octet-stream", "accept-ranges": "bytes",
    "content-disposition": contentDisposition(doc.filename, inline), "cache-control": "private, max-age=300",
  };
  const range = req.headers.get("range");
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m) {
    const start = m[1] ? parseInt(m[1], 10) : 0;
    const end = m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
    const buf = await storage.readRange(ctx.company.id, doc.storageKey, start, end);
    return new Response(new Uint8Array(buf), { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(buf.length) } });
  }
  const buf = await storage.get(ctx.company.id, doc.storageKey);
  return new Response(new Uint8Array(buf), { headers: { ...headers, "content-length": String(size) } });
}
