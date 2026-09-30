import { apiCtx, unauthorized } from "@/lib/apictx";
import { providerEnabled, startUrl, type Provider } from "@/lib/oauth";
import { requestOrigin } from "@/lib/origin";

export async function GET(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const ctx = await apiCtx();
  if (!ctx) return unauthorized();
  const p = (await params).provider.toUpperCase() as Provider;
  const origin = await requestOrigin();
  if (!["GOOGLE", "MICROSOFT"].includes(p) || !providerEnabled(p)) return Response.redirect(`${origin}/setup/email?mailbox=unavailable`, 302);
  return Response.redirect(await startUrl(p, ctx.company.id, ctx.user.id, `${origin}/setup/email?mailbox=connected`, origin), 302);
}
