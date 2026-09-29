import "server-only";
import { prisma, tenantDb, type TenantDb } from "./db";
import { storage, newKey } from "./storage";
import { buildRfqXlsx, rfqFileName } from "./rfq";
import { rfqHeader, rfqLines, fillTemplate, categoryNames } from "./rfqdata";
import { resolveRoute, type Route } from "./mail";
import { tenantBaseUrl } from "./baseurl";
import { logoUrl } from "./logo";
import { randomToken } from "./secret";
import { enqueue } from "./jobs";
import { PRODUCT_NAME, POWERED_BY } from "@/config/brand";

type Company = Awaited<ReturnType<typeof prisma.company.findUniqueOrThrow>>;
type User = { id: string; name: string; email: string; phone?: string | null };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmtDue = (d: Date | null) => (d ? d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "the date in the RFQ");

export async function templateVars(db: TenantDb, rfq: { number: string; categoryCode: string; projectId: string }, estimator: string) {
  const project = await db.project.findUniqueOrThrow({ where: { id: rfq.projectId } });
  const cats = await categoryNames(db);
  return { vars: { rfq_number: rfq.number, project: project.name, category: cats.get(rfq.categoryCode) ?? rfq.categoryCode, due: fmtDue(project.quoteDueAt), estimator }, project };
}

/** Subject and body from the company's template (Setup step 1). */
export function defaultEmail(company: Company, vars: Record<string, string>) {
  return {
    subject: fillTemplate(company.rfqSubject || "RFQ {rfq_number}: {category} for {project}, due {due}", vars),
    body: [
      fillTemplate(company.rfqBody || "Please quote the attached materials for {project}. Quotes are due {due}.", vars),
      fillTemplate(company.rfqSignature, vars),
    ].filter(Boolean).join("\n\n"),
  };
}

/** Render one email. token=null renders a preview with placeholder links. */
export function renderEmail(o: { company: Company; greetingName: string | null; subject: string; body: string; token: string | null; reminder?: boolean; attachmentName?: string | null }) {
  const base = tenantBaseUrl(o.company);
  const quote = o.token ? `${base}/q/${o.token}` : `${base}/q/…`;
  const decline = o.token ? `${base}/q/${o.token}?decline=1` : `${base}/q/…?decline=1`;
  // Greet by first name, unless the company's template already opens with a greeting.
  const first = o.greetingName && !/^\s*(hi|hello|hey|dear|good (morning|afternoon|day))\b/i.test(o.body) ? o.greetingName.trim().split(/\s+/)[0] : null;
  const hello = first ? `Hi ${first},\n\n` : "";
  const text = [
    `${hello}${o.body}`,
    `Enter your prices online (no login needed):\n${quote}`,
    o.attachmentName ? `Or fill in the attached spreadsheet (${o.attachmentName}) and reply with it.` : null,
    `Can't quote this one? Let us know: ${decline}`,
    `—\n${POWERED_BY}`,
  ].filter(Boolean).join("\n\n");
  const logo = logoUrl(o.company);
  const accent = o.company.accentColor || "#FF6B00";
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0b1b33;padding:18px 24px;border-bottom:4px solid ${esc(accent)}">
${logo ? `<img src="${base}${logo}" alt="" height="40" style="height:40px;vertical-align:middle;background:#fff;border-radius:6px;padding:2px;margin-right:10px">` : ""}
<span style="color:#fff;font-size:20px;font-weight:bold;vertical-align:middle">${esc(o.company.name)}</span></td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55">
${first ? `<p>Hi ${esc(first)},</p>` : ""}
${esc(o.body).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("")}
<p style="margin:28px 0"><a href="${quote}" style="background:${esc(accent)};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">${o.reminder ? "Enter your prices now" : "Enter prices online"}</a></p>
${o.attachmentName ? `<p style="color:#475569;font-size:13px">Prefer a spreadsheet? Fill in the attached <strong>${esc(o.attachmentName)}</strong> and reply with it.</p>` : ""}
<p style="color:#475569;font-size:13px">Can't quote this one? <a href="${decline}" style="color:#0b1b33">Let us know</a>.</p>
</td></tr>
<tr><td style="padding:14px 24px;background:#f8fafc;color:#94a3b8;font-size:11px">${esc(POWERED_BY)}</td></tr>
</table></td></tr></table>${o.token ? `<img src="${base}/api/t/${o.token}" width="1" height="1" alt="" style="display:none">` : ""}
</body></html>`;
  return { text, html, subject: o.subject };
}

export type Target = { supplierId: string | null; name: string; email: string; contactName: string | null; saveToDirectory?: boolean };

async function supplierXlsx(db: TenantDb, company: Company, rfq: any, supplierId: string | null) {
  const h = await rfqHeader(db, company, rfq, supplierId);
  const buf = await buildRfqXlsx(h, rfqLines(rfq));
  const name = rfqFileName(rfq.number, h.categoryName, rfq.revision, "xlsx", h.supplier?.name);
  const key = newKey(company.id, "outbox", name);
  await storage.put(company.id, key, buf);
  return { key, name };
}

/** Queue one approved RFQ email per target. Each gets its own secure quote link and pre-filled spreadsheet. */
export async function sendRfq(o: {
  company: Company; user: User; rfqId: string; targets: Target[]; subject: string; body: string;
  reminderHours: number[]; overflowToPlatform: boolean;
}) {
  const db = tenantDb(o.company.id);
  const rfq = await db.rfq.findUniqueOrThrow({ where: { id: o.rfqId } });
  const project = await db.project.findUniqueOrThrow({ where: { id: rfq.projectId } });
  let route: Route = await resolveRoute(o.company, o.user.id);
  const platform = await resolveRoute({ ...o.company, emailMethod: "PLATFORM" }, o.user.id);
  let used = route.limit?.used ?? 0;
  const results: { name: string; email: string; method: string; note: string | null }[] = [];
  for (const t of o.targets) {
    let r = route;
    if (route.limit && used >= route.limit.max) {
      if (!o.overflowToPlatform) { results.push({ name: t.name, email: t.email, method: "SKIPPED", note: `Daily limit of ${route.limit.max} reached for ${route.fromAddress}` }); continue; }
      r = { ...platform, fallbackNote: `${route.fromAddress} reached its daily limit, so this went through ${PRODUCT_NAME} sending.` };
    }
    let supplierId = t.supplierId;
    if (supplierId && !(await db.supplier.findUnique({ where: { id: supplierId } }))) supplierId = null;
    if (!supplierId && t.saveToDirectory) {
      const s = await db.supplier.create({ data: { name: t.name, kind: "SUPPLIER", categories: rfq.categoryCode === "ALL" ? [] : [rfq.categoryCode] } as any });
      await db.contact.create({ data: { supplierId: s.id, name: t.contactName ?? t.name, email: t.email, isPrimary: true } as any });
      supplierId = s.id;
    }
    const token = randomToken();
    const expires = new Date(Math.max(Date.now() + 30 * 864e5, (project.quoteDueAt?.getTime() ?? 0) + 14 * 864e5));
    const recipient = await db.rfqRecipient.create({
      data: {
        rfqId: rfq.id, supplierId, name: t.name, email: t.email, method: r.method === "LOG" ? "PLATFORM" : r.method, status: "QUEUED",
        token, tokenExpiresAt: expires, createdById: o.user.id, reminderHours: o.reminderHours.filter((h) => h > 0).sort((a, b) => b - a),
      } as any,
    });
    const file = await supplierXlsx(db, o.company, rfq, supplierId);
    const mail = renderEmail({ company: o.company, greetingName: t.contactName, subject: o.subject, body: o.body, token, attachmentName: file.name });
    const msg = await db.emailMessage.create({
      data: {
        rfqId: rfq.id, recipientId: recipient.id, kind: "RFQ", method: r.method, fromAddress: r.fromAddress, fromName: r.fromName,
        toAddress: t.email, replyTo: o.user.email, subject: mail.subject, text: mail.text, html: mail.html,
        attachmentKey: file.key, attachmentName: file.name, connectionId: r.connectionId, sentById: o.user.id, fallbackNote: r.fallbackNote,
      } as any,
    });
    await enqueue(o.company.id, "SEND_EMAIL", { messageId: msg.id });
    if (r.method === "CONNECTED") used++;
    results.push({ name: t.name, email: t.email, method: r.method, note: r.fallbackNote });
  }
  return results;
}

/** After a message is delivered (or fails), update the recipient and the activity log. */
export async function afterDelivery(companyId: string, messageId: string, error: string | null) {
  const db = tenantDb(companyId);
  const m = await db.emailMessage.findUnique({ where: { id: messageId } });
  if (!m) return;
  if (error) await db.emailMessage.update({ where: { id: m.id }, data: { status: "FAILED", error } });
  if (!m.recipientId || !m.rfqId) return;
  const rec = await db.rfqRecipient.findUnique({ where: { id: m.recipientId } });
  if (!rec) return;
  const logged = !error && m.method === "LOG";
  if (m.kind === "RFQ") {
    await db.rfqRecipient.update({ where: { id: rec.id }, data: error ? { status: "FAILED", lastError: error } : { status: logged ? "LOGGED" : "SENT", sentAt: new Date(), lastError: null } });
  }
  const label = m.method === "CONNECTED" ? `from ${m.fromAddress}` : m.method === "DOMAIN" ? `from ${m.fromAddress}` : `through ${PRODUCT_NAME}`;
  await db.rfqEvent.create({
    data: {
      rfqId: m.rfqId, recipientId: rec.id, userId: m.sentById,
      type: error ? "FAILED" : m.kind === "REMINDER" ? "REMINDER" : "SENT",
      detail: error ? `Couldn't send to ${m.toAddress}: ${error}`
        : logged ? `Saved for ${m.toAddress} but not delivered: email sending isn't configured on this server`
        : `${m.kind === "REMINDER" ? "Reminder sent" : "Sent"} to ${m.toAddress} ${label}${m.fallbackNote ? ` (${m.fallbackNote})` : ""}`,
    } as any,
  });
  if (error && m.sentById) {
    const rfq = await db.rfq.findUnique({ where: { id: m.rfqId } });
    await db.notification.create({ data: { userId: m.sentById, title: `Couldn't send ${rfq?.number ?? "an RFQ"} to ${rec.name}`, body: error, href: rfq ? `/projects/${rfq.projectId}/rfqs` : null } as any });
  }
}

/**
 * Runs every few minutes from the worker:
 *  - in-app RFQs: remind suppliers at the chosen hours before quotes are due
 *  - RFQs sent outside the app: remind the ESTIMATOR 24 hours before, since we can't email the supplier for them
 */
export async function sweepReminders(now = new Date()) {
  const open = await prisma.rfqRecipient.findMany({ where: { status: { in: ["SENT", "OPENED", "LOGGED"] } } });
  if (!open.length) return 0;
  const rfqs = await prisma.rfq.findMany({ where: { id: { in: [...new Set(open.map((r) => r.rfqId))] } } });
  const projects = await prisma.project.findMany({ where: { id: { in: [...new Set(rfqs.map((r) => r.projectId))] }, quoteDueAt: { gt: now } } });
  const companies = new Map((await prisma.company.findMany({ where: { id: { in: [...new Set(projects.map((p) => p.companyId))] } } })).map((c) => [c.id, c]));
  let sent = 0;
  for (const rec of open) {
    const rfq = rfqs.find((r) => r.id === rec.rfqId);
    const project = rfq && projects.find((p) => p.id === rfq.projectId && p.companyId === rec.companyId);
    const company = companies.get(rec.companyId);
    if (!rfq || !project || !company || !project.quoteDueAt) continue;
    const hoursLeft = (project.quoteDueAt.getTime() - now.getTime()) / 36e5;
    const db = tenantDb(company.id);
    const cats = await categoryNames(db);
    const cat = cats.get(rfq.categoryCode) ?? rfq.categoryCode;
    if (rec.method === "OUTSIDE") {
      if (hoursLeft <= 24 && !rec.estimatorRemindedAt) {
        const userId = rec.createdById ?? project.estimatorId;
        await db.rfqRecipient.update({ where: { id: rec.id }, data: { estimatorRemindedAt: now } });
        if (userId) {
          await db.notification.create({ data: { userId, title: `${cat} quote from ${rec.name} is due in ${Math.max(1, Math.round(hoursLeft))} hours and hasn't been logged`, body: `${rfq.number} · ${project.name}`, href: `/projects/${project.id}/quotes` } as any });
        }
        await db.rfqEvent.create({ data: { rfqId: rfq.id, recipientId: rec.id, type: "ESTIMATOR_REMINDER", detail: `Reminded the estimator: ${rec.name}'s quote is due soon and hasn't been logged` } as any });
        sent++;
      }
      continue;
    }
    if (rec.status === "LOGGED" || !rec.email) continue;
    const due = rec.reminderHours.filter((h) => hoursLeft <= h && !rec.remindersSent.includes(h));
    if (!due.length) continue;
    await db.rfqRecipient.update({ where: { id: rec.id }, data: { remindersSent: [...rec.remindersSent, ...due] } });
    const sender = rec.createdById ? await prisma.user.findFirst({ where: { id: rec.createdById, companyId: company.id } }) : null;
    const route = await resolveRoute(company, sender?.id ?? "");
    const contact = rec.supplierId ? await db.contact.findFirst({ where: { supplierId: rec.supplierId, email: rec.email } }) : null;
    const mail = renderEmail({
      company, greetingName: contact?.name ?? null, token: rec.token, reminder: true,
      subject: `Reminder: RFQ ${rfq.number} (${cat}) is due ${fmtDue(project.quoteDueAt)}`,
      body: `A friendly reminder that quotes for ${cat} on ${project.name} are due ${fmtDue(project.quoteDueAt)}. If you've already sent your quote, thank you, and please ignore this note.`,
    });
    const msg = await db.emailMessage.create({
      data: {
        rfqId: rfq.id, recipientId: rec.id, kind: "REMINDER", method: route.method, fromAddress: route.fromAddress, fromName: route.fromName,
        toAddress: rec.email, replyTo: sender?.email ?? null, subject: mail.subject, text: mail.text, html: mail.html,
        connectionId: route.connectionId, sentById: sender?.id ?? null, fallbackNote: route.fallbackNote,
      } as any,
    });
    await enqueue(company.id, "SEND_EMAIL", { messageId: msg.id });
    sent++;
  }
  return sent;
}
