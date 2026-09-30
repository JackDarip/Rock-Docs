import "server-only";
import crypto from "node:crypto";
import { prisma } from "./db";
import { decrypt, encrypt, hasAppSecret } from "./secret";

// "Connect my email": each estimator links their own Google or Microsoft
// mailbox. Tokens are encrypted at rest; RFQs then send from that mailbox and
// land in its Sent folder.

export type Provider = "GOOGLE" | "MICROSOFT";

const CFG = {
  GOOGLE: {
    auth: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "openid email https://www.googleapis.com/auth/gmail.send",
    id: () => process.env.GOOGLE_CLIENT_ID, secret: () => process.env.GOOGLE_CLIENT_SECRET,
    extra: { access_type: "offline", prompt: "consent" } as Record<string, string>,
  },
  MICROSOFT: {
    auth: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "openid email offline_access https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read",
    id: () => process.env.MICROSOFT_CLIENT_ID, secret: () => process.env.MICROSOFT_CLIENT_SECRET,
    extra: { prompt: "select_account" } as Record<string, string>,
  },
} as const;

export const providerEnabled = (p: Provider) => !!(CFG[p].id() && CFG[p].secret() && hasAppSecret());

/** One registered redirect URI serves every tenant; the state row says which. */
export function redirectUri(p: Provider, requestOrigin: string) {
  const base = (process.env.OAUTH_REDIRECT_BASE ?? requestOrigin).replace(/\/$/, "");
  return `${base}/api/oauth/${p.toLowerCase()}/callback`;
}

export async function startUrl(p: Provider, companyId: string, userId: string, returnTo: string, requestOrigin: string) {
  const state = crypto.randomBytes(24).toString("base64url");
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  await prisma.oAuthState.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.oAuthState.create({ data: { id: state, companyId, userId, provider: p, verifier, returnTo, expiresAt: new Date(Date.now() + 10 * 60e3) } });
  const q = new URLSearchParams({
    client_id: CFG[p].id()!, redirect_uri: redirectUri(p, requestOrigin), response_type: "code", scope: CFG[p].scope,
    state, code_challenge: challenge, code_challenge_method: "S256", ...CFG[p].extra,
  });
  return `${CFG[p].auth}?${q}`;
}

async function tokenRequest(p: Provider, body: Record<string, string>) {
  const r = await fetch(CFG[p].token, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CFG[p].id()!, client_secret: CFG[p].secret()!, ...body }),
  });
  const j = await r.json() as any;
  if (!r.ok) throw new Error(j.error_description ?? j.error ?? `Token request failed (${r.status})`);
  return j as { access_token: string; refresh_token?: string; expires_in: number; id_token?: string };
}

function emailFromIdToken(idToken?: string) {
  if (!idToken) return null;
  try { const c = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString()); return (c.email ?? c.preferred_username ?? null) as string | null; } catch { return null; }
}

/** Provider daily limits (conservative): consumer Gmail 500, Workspace 2,000; Outlook.com 300, Microsoft 365 10,000. */
export function dailyLimitFor(p: Provider, email: string) {
  const d = email.split("@")[1]?.toLowerCase() ?? "";
  if (p === "GOOGLE") return d === "gmail.com" || d === "googlemail.com" ? 500 : 2000;
  return ["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(d) ? 300 : 10000;
}

export async function finishConnect(p: Provider, stateId: string, code: string, requestOrigin: string) {
  const st = await prisma.oAuthState.findUnique({ where: { id: stateId } });
  if (!st || st.provider !== p || st.expiresAt < new Date()) throw new Error("This sign-in link expired. Try connecting again.");
  await prisma.oAuthState.delete({ where: { id: stateId } });
  const t = await tokenRequest(p, { grant_type: "authorization_code", code, redirect_uri: redirectUri(p, requestOrigin), code_verifier: st.verifier });
  let email = emailFromIdToken(t.id_token);
  if (!email && p === "MICROSOFT") {
    const me = await fetch("https://graph.microsoft.com/v1.0/me", { headers: { authorization: `Bearer ${t.access_token}` } }).then((r) => r.json()) as any;
    email = me.mail ?? me.userPrincipalName ?? null;
  }
  if (!email) throw new Error("The provider didn't share an email address");
  const data = {
    provider: p, email, accessTokenEnc: encrypt(t.access_token), refreshTokenEnc: t.refresh_token ? encrypt(t.refresh_token) : null,
    expiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000), dailyLimit: dailyLimitFor(p, email), lastError: null,
  };
  await prisma.mailboxConnection.upsert({
    where: { companyId_userId: { companyId: st.companyId, userId: st.userId } },
    create: { companyId: st.companyId, userId: st.userId, ...data }, update: data,
  });
  return st.returnTo;
}

export async function accessToken(connectionId: string) {
  const c = await prisma.mailboxConnection.findUniqueOrThrow({ where: { id: connectionId } });
  if (c.expiresAt > new Date()) return { token: decrypt(c.accessTokenEnc), conn: c };
  if (!c.refreshTokenEnc) throw new Error("Mailbox connection expired; reconnect it in Setup → Email sending");
  const p = c.provider as Provider;
  const t = await tokenRequest(p, { grant_type: "refresh_token", refresh_token: decrypt(c.refreshTokenEnc), ...(p === "MICROSOFT" ? { scope: CFG[p].scope } : {}) });
  await prisma.mailboxConnection.update({
    where: { id: c.id },
    data: { accessTokenEnc: encrypt(t.access_token), expiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000), ...(t.refresh_token ? { refreshTokenEnc: encrypt(t.refresh_token) } : {}) },
  });
  return { token: t.access_token, conn: c };
}

/** Messages this mailbox sent through us in the last 24 hours. */
export const sentLast24h = (connectionId: string) =>
  prisma.emailMessage.count({ where: { connectionId, status: "SENT", sentAt: { gte: new Date(Date.now() - 864e5) } } });
