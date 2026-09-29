import { getTenant } from "@/lib/tenant";
import { notFound } from "@/lib/apictx";
import { storage } from "@/lib/storage";

// The logo of the company that owns this subdomain. Public (it appears on the
// sign-in page and the supplier quote form); callers add ?v=<updatedAt> so a new
// upload shows everywhere at once.
export async function GET(req: Request) {
  const company = await getTenant();
  if (!company?.logoPath) return notFound();
  const buf = await storage.get(company.id, company.logoPath).catch(() => null);
  if (!buf) return notFound();
  const ext = company.logoPath.split(".").pop()?.toLowerCase();
  const type = ext === "png" ? "image/png" : ext === "svg" ? "image/svg+xml" : ext === "webp" ? "image/webp" : "image/jpeg";
  const versioned = new URL(req.url).searchParams.has("v");
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": type,
      "cache-control": versioned ? "public, max-age=31536000, immutable" : "no-cache",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
