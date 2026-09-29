import { requireCtx } from "@/lib/auth";
import { PageHeader, Card, Term, fmtDateTime } from "@/components/ui";
import { StepNav } from "@/components/StepNav";
import { EmailMethodPicker } from "@/components/EmailMethodPicker";
import { DomainSetup, MailboxCard, ReminderDefaults } from "@/components/EmailSetup";
import { PRODUCT_NAME } from "@/config/brand";
import { platformDomain, resendEnabled } from "@/lib/mail";
import { providerEnabled, sentLast24h } from "@/lib/oauth";

export default async function EmailStep({ searchParams }: { searchParams: Promise<{ mailbox?: string; detail?: string }> }) {
  const { company, isAdmin, db, user } = await requireCtx();
  const { mailbox, detail } = await searchParams;
  const live = resendEnabled() && !!platformDomain();
  const conn = await db.mailboxConnection.findFirst({ where: { userId: user.id } });
  const recent = isAdmin ? await db.emailMessage.findMany({ orderBy: { createdAt: "desc" }, take: 15 }) : [];
  return (
    <>
      <PageHeader eyebrow="Step 9 of 9 · Optional" title="Email sending"
        subtitle={<>You never have to send anything from inside {PRODUCT_NAME}: every RFQ can be downloaded and sent from your own email. This step controls how &quot;Send from {PRODUCT_NAME}&quot; works.</>} />
      {!live && (
        <div className="mb-4 rounded-xl border border-warn-line bg-warn-bg p-3 text-sm text-warn">
          ⚠ Email delivery isn&apos;t switched on for this server yet. You can still preview and &quot;send&quot; RFQs; they&apos;re saved in the log but don&apos;t leave the building until your platform administrator adds <code>RESEND_API_KEY</code> and <code>MAIL_FROM_DOMAIN</code>.
        </div>
      )}
      {mailbox === "connected" && <div className="mb-4 rounded-xl border border-emerald-200 bg-ok-bg p-3 text-sm text-ok">✓ Mailbox connected.</div>}
      {mailbox === "error" && <div className="mb-4 rounded-xl border border-warn-line bg-warn-bg p-3 text-sm text-warn">⚠ Couldn&apos;t connect the mailbox{detail ? `: ${detail}` : ""}.</div>}
      {mailbox === "unavailable" && <div className="mb-4 rounded-xl border border-warn-line bg-warn-bg p-3 text-sm text-warn">⚠ That sign-in option isn&apos;t switched on for this server yet.</div>}

      <EmailMethodPicker current={company.emailMethod} readOnly={!isAdmin} companyName={company.name} />

      {company.emailMethod === "DOMAIN" && (
        <Card className="mt-6" title={<>Send from your own domain <Term k="spf">(what are these records?)</Term></>}>
          <DomainSetup domain={company.customEmailDomain ?? ""} fromLocal={company.emailFromLocal} readOnly={!isAdmin}
            records={(company.emailDomainRecords ?? []) as any} verifiedAt={company.emailDomainVerifiedAt?.toISOString() ?? null}
            status={company.emailDomainStatus} checkedAt={company.emailDomainCheckedAt?.toISOString() ?? null} />
        </Card>
      )}
      {company.emailMethod === "CONNECTED" && (
        <Card className="mt-6" title="Your mailbox">
          <MailboxCard google={providerEnabled("GOOGLE")} microsoft={providerEnabled("MICROSOFT")}
            connection={conn ? { provider: conn.provider, email: conn.email, used: await sentLast24h(conn.id), limit: conn.dailyLimit, lastError: conn.lastError } : null} />
        </Card>
      )}

      <Card className="mt-6" title="Supplier reminders">
        <p className="mb-2 text-sm text-muted">For RFQs sent from {PRODUCT_NAME}, suppliers who haven&apos;t responded or declined get a short reminder at these times before quotes are due. You can change them on each send. For RFQs you send yourself, {PRODUCT_NAME} reminds <em>you</em> 24 hours before instead.</p>
        <ReminderDefaults hours={company.reminderHours} readOnly={!isAdmin} />
      </Card>

      {isAdmin && recent.length > 0 && (
        <Card className="mt-6" title="Recent emails">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>When</th><th>To</th><th>Subject</th><th>How</th><th>Status</th></tr></thead>
              <tbody>{recent.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap text-xs">{fmtDateTime(m.createdAt)}</td><td className="text-xs">{m.toAddress}</td><td className="text-xs">{m.subject}</td>
                  <td className="text-xs">{m.method === "LOG" ? "Not delivered (not configured)" : m.method === "CONNECTED" ? `Mailbox ${m.fromAddress}` : m.method === "DOMAIN" ? m.fromAddress : `${PRODUCT_NAME} sending`}</td>
                  <td><span className={`flag ${m.status === "SENT" ? "flag-ok" : m.status === "FAILED" || m.status === "LOGGED" ? "flag-warn" : "flag-muted"}`} title={m.error ?? undefined}>{m.status === "LOGGED" ? "Saved only" : m.status.toLowerCase()}</span></td>
                </tr>))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <StepNav current="email" />
    </>
  );
}
