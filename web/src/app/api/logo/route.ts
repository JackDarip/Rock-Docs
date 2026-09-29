import { apiCtx, notFound, unauthorized } from "@/lib/apictx";
import { storage } from "@/lib/storage";

export async function GET() {
  const ctx = await apiCtx();
  if (!ctx) return unauthorized();
  if (!ctx.company.logoPath) return notFound();
  const buf = await storage.get(ctx.company.id, ctx.company.logoPath);
  const ext = ctx.company.logoPath.split(".").pop()?.toLowerCase();
  const type = ext === "png" ? "image/png" : ext === "svg" ? "image/svg+xml" : ext === "webp" ? "image/webp" : "image/jpeg";
  return new Response(new Uint8Array(buf), { headers: { "content-type": type, "cache-control": "private, max-age=60" } });
}
