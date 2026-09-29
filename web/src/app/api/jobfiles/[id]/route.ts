import { apiCtx, contentDisposition, notFound, unauthorized } from "@/lib/apictx";
import { storage } from "@/lib/storage";

// A past job's source document, tenant-scoped like every other file.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiCtx();
  if (!ctx) return unauthorized();
  const f = await ctx.db.jobCostFile.findUnique({ where: { id: (await params).id } });
  if (!f) return notFound();
  const buf = await storage.get(ctx.company.id, f.storageKey);
  const inline = /\.(pdf|png|jpe?g)$/i.test(f.filename);
  return new Response(new Uint8Array(buf), { headers: { "content-type": f.mime || "application/octet-stream", "content-disposition": contentDisposition(f.filename, inline), "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" } });
}
