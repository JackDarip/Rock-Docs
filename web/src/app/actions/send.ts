"use server";

import dns from "node:dns/promises";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCtx, requireAdminCtx } from "@/lib/auth";
import { resolveRoute, resendEnabled } from "@/lib/mail";
import { defaultEmail, renderEmail, sendRfq, templateVars } from "@/lib/rfqsend";
import { enqueue } from "@/lib/jobs";
import { PRODUCT_NAME } from "@/config/brand";

const targetSchema = z.object({
  supplierId: z.string().nullable(), name: z.string().trim().min(1), email: z.string().trim().email(),
  contactName: z.string().trim().nullable(), saveToDirectory: z.boolean().optional(),
});
const draftSchema = z.object({ subject: z.string().trim().min(1).max(300), body: z.string().trim().min(1).max(20000) });

/** The email every selected supplier will get, rendered for review before anything is sent. */
export async function previewRfqEmails(rfqId: string, rawTargets: unknown[], rawDraft: unknown) {
  const { db, company, user } = await requireCtx();
  const rfq = await db.rfq.findUnique({ where: { id: rfqId } });
  if (!rfq) return { ok: false as const, error: "RFQ not found" };
  const targets = z.array(targetSchema).min(1, "Pick at least one supplier with an email address").safeParse(rawTargets);
  if (!targets.success) return { ok: false as const, error: targets.error.issues[0]?.message ?? "Check the recipients" };
  const draft = draftSchema.safeParse(rawDraft);
  if (!draft.success) return { ok: false as const, error: "Subject and message can't be empty" };
  const route = await resolveRoute(company, user.id);
  const previews = targets.data.map((t) => ({ ...t, ...renderEmail({ company, greetingName: t.contactName, subject: draft.data.subject, body: draft.data.body, token: null, attachmentName: `${rfq.number}.xlsx` }) }));
  const overLimit = route.limit ? Math.max(0, route.limit.used + targets.data.length - route.limit.max) : 0;
  const nearLimit = route.limit ? route.limit.used + targets.data.length >= route.limit.max * 0.8 : false;
  return {
    ok: true as const, previews,
    route: { method: route.method, from: route.fromName ? `${route.fromName} <${route.fromAddress}>` : route.fromAddress, replyTo: user.email, note: route.fallbackNote, limit: route.limit ?? null, overLimit, nearLimit },
  };
}

export async function sendRfqEmails(rfqId: string, rawTargets: unknown[], rawDraft: unknown, reminderHours: number[], overflowToPlatform: boolean) {
  const { db, company, user } = await requireCtx();
  const rfq = await db.rfq.findUnique({ where: { id: rfqId } });
  if (!rfq) return { ok: false as const, error: "RFQ not found" };
  if (rfq.superseded) return { ok: false as const, error: "This RFQ has a newer revision. Send the latest one." };
  const targets = z.array(targetSchema).min(1).parse(rawTargets);
  const draft = draftSchema.parse(rawDraft);
  const hours = z.array(z.number().int().min(1).max(24 * 30)).max(5).parse(reminderHours);
  const results = await sendRfq({ company, user, rfqId, targets, subject: draft.subject, body: draft.body, reminderHours: hours, overflowToPlatform });
  revalidatePath(`/projects/${rfq.projectId}/rfqs`);
  return { ok: true as const, results };
}

export async function rfqEmailDraft(rfqId: string) {
  const { db, company, user } = await requireCtx();
  const rfq = await db.rfq.findUniqueOrThrow({ where: { id: rfqId } });
  const { vars } = await templateVars(db, rfq, user.name);
  return defaultEmail(company, vars);
}

// ---------- Setup: company domain ----------

type DnsRecord = { record: string; type: string; name: string; value: string; priority?: number; status?: string; found?: boolean };

async function resend(path: string, init?: RequestInit) {
  const r = await fetch(`${process.env.RESEND_API_URL ?? "https://api.resend.com"}${path}`, { ...init, headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json", ...(init?.headers ?? {}) } });
  const j = await r.json().catch(() => ({})) as any;
  if (!r.ok) throw new Error(j.message ?? `Email provider error ${r.status}`);
  return j;
}

const domainSchema = z.string().trim().toLowerCase().regex(/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, "Enter a domain like yourcompany.com");

/** Register the company's domain with the email provider and store the exact DNS records it needs. */
export async function setupDomain(rawDomain: string, fromLocal: string) {
  const { company } = await requireAdminCtx();
  const d = domainSchema.safeParse(rawDomain);
  if (!d.success) return { ok: false as const, error: d.error.issues[0].message };
  const local = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{1,40}$/).catch("bids").parse(fromLocal);
  const dmarc: DnsRecord = { record: "DMARC", type: "TXT", name: `_dmarc.${d.data}`, value: `v=DMARC1; p=none; rua=mailto:dmarc@${d.data}` };
  let records: DnsRecord[] = [dmarc];
  let domainId: string | null = null;
  let status = "Email provider not configured";
  if (resendEnabled()) {
    try {
      const existing = company.emailDomainId && company.customEmailDomain === d.data ? await resend(`/domains/${company.emailDomainId}`) : await resend("/domains", { method: "POST", body: JSON.stringify({ name: d.data }) });
      domainId = existing.id;
      status = existing.status;
      records = [...(existing.records ?? []).map((r: any) => ({ record: r.record, type: r.type, name: r.name.includes(d.data) ? r.name : `${r.name}.${d.data}`, value: r.value, priority: r.priority, status: r.status })), dmarc];
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }
  await prisma.company.update({
    where: { id: company.id },
    data: { customEmailDomain: d.data, emailFromLocal: local, emailDomainId: domainId, emailDomainRecords: records as any, emailDomainStatus: status, emailDomainVerifiedAt: null, emailDomainCheckedAt: null },
  });
  revalidatePath("/setup/email");
  return { ok: true as const };
}

async function lookup(r: DnsRecord) {
  try {
    if (r.type === "TXT") return (await dns.resolveTxt(r.name)).map((x) => x.join("")).some((v) => v.replace(/\s+/g, "") === r.value.replace(/\s+/g, "") || (r.record === "DMARC" && v.startsWith("v=DMARC1")));
    if (r.type === "MX") return (await dns.resolveMx(r.name)).some((x) => x.exchange.toLowerCase() === r.value.toLowerCase());
    if (r.type === "CNAME") return (await dns.resolveCname(r.name)).some((x) => x.toLowerCase() === r.value.toLowerCase());
  } catch { return false; }
  return false;
}

/** Live "Verify" check: our own DNS lookups plus the provider's verification. */
export async function verifyDomain() {
  const { company } = await requireAdminCtx();
  const records = (company.emailDomainRecords ?? []) as DnsRecord[];
  if (!company.customEmailDomain || !records.length) return { ok: false as const, error: "Enter your domain first" };
  const checked = await Promise.all(records.map(async (r) => ({ ...r, found: await lookup(r) })));
  let status = "Email provider not configured";
  let verified = false;
  if (resendEnabled() && company.emailDomainId) {
    try {
      await resend(`/domains/${company.emailDomainId}/verify`, { method: "POST" });
      const d = await resend(`/domains/${company.emailDomainId}`);
      status = d.status;
      verified = d.status === "verified";
    } catch (e) { status = e instanceof Error ? e.message : String(e); }
  }
  await prisma.company.update({
    where: { id: company.id },
    data: { emailDomainRecords: checked as any, emailDomainStatus: status, emailDomainCheckedAt: new Date(), emailDomainVerifiedAt: verified ? (company.emailDomainVerifiedAt ?? new Date()) : null },
  });
  revalidatePath("/setup/email");
  return { ok: true as const, verified, status, found: checked.filter((r) => r.found).length, total: checked.length };
}

/** "Send these instructions to my IT / web person." */
export async function sendDnsInstructions(to: string) {
  const { db, company, user } = await requireAdminCtx();
  const email = z.string().trim().email("Enter a valid email").safeParse(to);
  if (!email.success) return { ok: false as const, error: email.error.issues[0].message };
  const records = (company.emailDomainRecords ?? []) as DnsRecord[];
  if (!records.length) return { ok: false as const, error: "Enter your domain first" };
  const route = await resolveRoute({ ...company, emailMethod: "PLATFORM" }, user.id);
  const text = [
    `Hi,`,
    `${user.name} at ${company.name} asked me to send you the DNS records needed so estimates and supplier RFQs can be emailed from ${company.emailFromLocal}@${company.customEmailDomain} through ${PRODUCT_NAME}.`,
    `Please add these records at the DNS host for ${company.customEmailDomain}:`,
    records.map((r) => `${r.type.padEnd(5)} ${r.name}\n      ${r.value}${r.priority != null ? `  (priority ${r.priority})` : ""}`).join("\n\n"),
    `DNS changes can take up to 48 hours. ${user.name} can click "Verify" in ${PRODUCT_NAME} once they're in.`,
    `Questions: reply to this email to reach ${user.name}.`,
  ].join("\n\n");
  const msg = await db.emailMessage.create({
    data: { kind: "DNS_INSTRUCTIONS", method: route.method, fromAddress: route.fromAddress, fromName: route.fromName, toAddress: email.data, replyTo: user.email, subject: `DNS records for ${company.customEmailDomain} email`, text, sentById: user.id, fallbackNote: route.fallbackNote } as any,
  });
  await enqueue(company.id, "SEND_EMAIL", { messageId: msg.id });
  return { ok: true as const, delivered: route.method !== "LOG", note: route.fallbackNote };
}

export async function setReminderHours(hours: number[]) {
  const { company } = await requireAdminCtx();
  const h = z.array(z.number().int().min(1).max(720)).max(5).parse(hours);
  await prisma.company.update({ where: { id: company.id }, data: { reminderHours: [...new Set(h)].sort((a, b) => b - a) } });
  revalidatePath("/setup/email");
  return { ok: true as const };
}

export async function disconnectMailbox() {
  const { db, user } = await requireCtx();
  await db.mailboxConnection.deleteMany({ where: { userId: user.id } });
  revalidatePath("/setup/email");
  return { ok: true as const };
}

// ---------- Notifications ----------

export async function markNotificationsRead(ids: string[] | "all") {
  const { db, user } = await requireCtx();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null, ...(ids === "all" ? {} : { id: { in: ids } }) }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}
