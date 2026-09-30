import "server-only";
import crypto from "node:crypto";
import { prisma } from "./db";
import { storage } from "./storage";
import { PRODUCT_NAME } from "@/config/brand";
import { accessToken, sentLast24h } from "./oauth";

// Email delivery for the three sending methods (Setup step 9):
//   PLATFORM  — our verified domain, "Company via rockitdocs", reply-to the estimator
//   DOMAIN    — the company's own domain once its DNS records verify (falls back to PLATFORM until then)
//   CONNECTED — the estimator's own Google / Microsoft mailbox
// PLATFORM and DOMAIN go through Resend (RESEND_API_KEY). Without a key the
// message is kept in the log as LOGGED and nothing leaves the server; the UI says so.

export const resendEnabled = () => !!process.env.RESEND_API_KEY;
export const platformDomain = () => process.env.MAIL_FROM_DOMAIN ?? null;

type CompanyMail = {
  id: string; name: string; emailMethod: string; customEmailDomain: string | null;
  emailDomainVerifiedAt: Date | null; emailFromLocal: string;
};

export type Route = {
  method: "PLATFORM" | "DOMAIN" | "CONNECTED" | "LOG";
  fromAddress: string; fromName: string; connectionId: string | null; fallbackNote: string | null;
  limit?: { used: number; max: number };
};

function platformRoute(c: CompanyMail, note: string | null): Route {
  const domain = platformDomain();
  const live = resendEnabled() && !!domain;
  return {
    method: live ? "PLATFORM" : "LOG",
    fromAddress: `${process.env.MAIL_FROM_LOCAL ?? "rfq"}@${domain ?? "rockitdocs.invalid"}`,
    fromName: `${c.name} via ${PRODUCT_NAME}`,
    connectionId: null,
    fallbackNote: live ? note : "Email delivery isn't switched on for this server yet (no RESEND_API_KEY / MAIL_FROM_DOMAIN). Messages are saved in the log but not delivered.",
  };
}

/** Decide how a message from this user goes out, with the reason for any fallback. */
export async function resolveRoute(c: CompanyMail, userId: string): Promise<Route> {
  if (c.emailMethod === "CONNECTED") {
    const conn = await prisma.mailboxConnection.findUnique({ where: { companyId_userId: { companyId: c.id, userId } } });
    if (!conn) return platformRoute(c, `You haven't connected your mailbox yet, so this goes out through ${PRODUCT_NAME} sending.`);
    const used = await sentLast24h(conn.id);
    return { method: "CONNECTED", fromAddress: conn.email, fromName: "", connectionId: conn.id, fallbackNote: null, limit: { used, max: conn.dailyLimit } };
  }
  if (c.emailMethod === "DOMAIN") {
    if (c.customEmailDomain && c.emailDomainVerifiedAt && resendEnabled()) {
      return { method: "DOMAIN", fromAddress: `${c.emailFromLocal}@${c.customEmailDomain}`, fromName: c.name, connectionId: null, fallbackNote: null };
    }
    return platformRoute(c, `${c.customEmailDomain ?? "Your domain"} isn't verified yet, so this goes out through ${PRODUCT_NAME} sending until it is.`);
  }
  return platformRoute(c, null);
}

// ---------- MIME (for Gmail's raw send) ----------

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64").replace(/.{76}/g, "$&\r\n");
const encWord = (s: string) => (/^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`);
const addr = (name: string, email: string) => (name ? `"${encWord(name).replace(/"/g, "'")}" <${email}>` : email);

export function buildMime(m: { from: string; fromName: string; to: string; replyTo?: string | null; subject: string; text: string; html?: string | null; attachment?: { name: string; data: Buffer; type: string } | null }) {
  const mixed = `mixed_${crypto.randomBytes(8).toString("hex")}`;
  const alt = `alt_${crypto.randomBytes(8).toString("hex")}`;
  const lines = [
    `From: ${addr(m.fromName, m.from)}`, `To: ${m.to}`, ...(m.replyTo ? [`Reply-To: ${m.replyTo}`] : []),
    `Subject: ${encWord(m.subject)}`, "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${mixed}"`, "",
    `--${mixed}`, `Content-Type: multipart/alternative; boundary="${alt}"`, "",
    `--${alt}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(m.text),
    ...(m.html ? [`--${alt}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(m.html)] : []),
    `--${alt}--`,
    ...(m.attachment ? [`--${mixed}`, `Content-Type: ${m.attachment.type}; name="${m.attachment.name}"`, `Content-Disposition: attachment; filename="${m.attachment.name}"`, "Content-Transfer-Encoding: base64", "", b64(m.attachment.data)] : []),
    `--${mixed}--`, "",
  ];
  return lines.join("\r\n");
}

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function sendResend(m: { from: string; fromName: string; to: string; replyTo: string | null; subject: string; text: string; html: string | null; attachment: { name: string; data: Buffer } | null }) {
  const r = await fetch(`${process.env.RESEND_API_URL ?? "https://api.resend.com"}/emails`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: addr(m.fromName, m.from), to: [m.to], subject: m.subject, text: m.text, html: m.html ?? undefined,
      reply_to: m.replyTo ? [m.replyTo] : undefined,
      attachments: m.attachment ? [{ filename: m.attachment.name, content: m.attachment.data.toString("base64") }] : undefined,
    }),
  });
  const j = await r.json().catch(() => ({})) as any;
  if (!r.ok) throw new Error(j.message ?? `Email provider error ${r.status}`);
  return j.id as string;
}

async function sendGmail(token: string, raw: string) {
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url") }),
  });
  const j = await r.json().catch(() => ({})) as any;
  if (!r.ok) throw new Error(j.error?.message ?? `Gmail error ${r.status}`);
  return j.id as string;
}

async function sendGraph(token: string, m: { to: string; replyTo: string | null; subject: string; text: string; html: string | null; attachment: { name: string; data: Buffer } | null }) {
  const r = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      saveToSentItems: true,
      message: {
        subject: m.subject, body: m.html ? { contentType: "HTML", content: m.html } : { contentType: "Text", content: m.text },
        toRecipients: [{ emailAddress: { address: m.to } }],
        ...(m.replyTo ? { replyTo: [{ emailAddress: { address: m.replyTo } }] } : {}),
        attachments: m.attachment ? [{ "@odata.type": "#microsoft.graph.fileAttachment", name: m.attachment.name, contentType: XLSX, contentBytes: m.attachment.data.toString("base64") }] : [],
      },
    }),
  });
  if (!r.ok) { const j = await r.json().catch(() => ({})) as any; throw new Error(j.error?.message ?? `Microsoft error ${r.status}`); }
  return `graph-${Date.now()}`;
}

/** Deliver one queued EmailMessage. Called by the SEND_EMAIL background job. */
export async function deliver(messageId: string) {
  const m = await prisma.emailMessage.findUniqueOrThrow({ where: { id: messageId } });
  if (m.status === "SENT" || m.status === "LOGGED") return m;
  const attachment = m.attachmentKey ? { name: m.attachmentName ?? "RFQ.xlsx", data: await storage.get(m.companyId, m.attachmentKey), type: XLSX } : null;
  let providerId: string | null = null;
  let status = "SENT";
  if (m.method === "LOG") {
    status = "LOGGED";
  } else if (m.method === "CONNECTED") {
    if (!m.connectionId) throw new Error("No mailbox connection");
    const { token, conn } = await accessToken(m.connectionId);
    if ((await sentLast24h(conn.id)) >= conn.dailyLimit) throw new Error(`Daily sending limit reached for ${conn.email} (${conn.dailyLimit}/day). Try again tomorrow or send through ${PRODUCT_NAME}.`);
    providerId = conn.provider === "GOOGLE"
      ? await sendGmail(token, buildMime({ from: conn.email, fromName: "", to: m.toAddress, replyTo: m.replyTo, subject: m.subject, text: m.text, html: m.html, attachment }))
      : await sendGraph(token, { to: m.toAddress, replyTo: m.replyTo, subject: m.subject, text: m.text, html: m.html, attachment });
  } else {
    providerId = await sendResend({ from: m.fromAddress, fromName: m.fromName ?? "", to: m.toAddress, replyTo: m.replyTo, subject: m.subject, text: m.text, html: m.html, attachment });
  }
  return prisma.emailMessage.update({ where: { id: m.id }, data: { status, providerId, sentAt: new Date(), error: null } });
}
