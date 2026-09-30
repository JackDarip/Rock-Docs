import { finishConnect, type Provider } from "@/lib/oauth";
import { requestOrigin } from "@/lib/origin";
import { prisma } from "@/lib/db";

// Provider redirects here after the estimator approves. The state row (single
// use, 10-minute expiry, PKCE) identifies the tenant and user, so one
// registered redirect URI (OAUTH_REDIRECT_BASE) can serve every subdomain.
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const p = (await params).provider.toUpperCase() as Provider;
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  const pending = await prisma.oAuthState.findUnique({ where: { id: state } });
  const back = pending?.returnTo.replace(/\?.*$/, "") ?? null;
  if (!code) {
    if (pending) await prisma.oAuthState.delete({ where: { id: state } });
    return back ? Response.redirect(`${back}?mailbox=cancelled`, 302) : new Response("Sign-in was cancelled.", { status: 400 });
  }
  try {
    const returnTo = await finishConnect(p, state, code, await requestOrigin());
    return Response.redirect(returnTo, 302);
  } catch (e) {
    const msg = encodeURIComponent(e instanceof Error ? e.message : "Couldn't connect the mailbox");
    return back ? Response.redirect(`${back}?mailbox=error&detail=${msg}`, 302) : new Response(decodeURIComponent(msg), { status: 400 });
  }
}
