import { requireCtx } from "@/lib/auth";
import { PageHeader, Card, Flag, Term } from "@/components/ui";
import { StepNav } from "@/components/StepNav";
import { EmailMethodPicker } from "@/components/EmailMethodPicker";
import { PRODUCT_NAME } from "@/config/brand";

export default async function EmailStep() {
  const { company, isAdmin } = await requireCtx();
  const domain = company.customEmailDomain ?? "yourcompany.com";
  const records = [
    { type: "TXT", host: domain, value: `v=spf1 include:spf.rockitdocs-mail.com ~all` },
    { type: "CNAME", host: `rd1._domainkey.${domain}`, value: `rd1.dkim.rockitdocs-mail.com` },
    { type: "CNAME", host: `rd2._domainkey.${domain}`, value: `rd2.dkim.rockitdocs-mail.com` },
    { type: "TXT", host: `_dmarc.${domain}`, value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}` },
  ];
  return (
    <>
      <PageHeader eyebrow="Step 9 of 9 · Optional" title="Email sending"
        subtitle={<>You never have to send anything from inside {PRODUCT_NAME}: every RFQ can be downloaded and sent from your own email. This step only controls how in-app sending works.</>} />
      <div className="mb-4 rounded-xl border border-mist bg-white p-4 text-sm">
        <Flag tone="info">Status</Flag> In-app sending (with delivery tracking and automatic supplier reminders) is the next build phase. Today, use <strong>Download</strong>, <strong>Copy email text</strong>, or <strong>Open in my email</strong> on any RFQ, then <strong>Mark as sent</strong> to track it.
      </div>
      <EmailMethodPicker current={company.emailMethod} domain={company.customEmailDomain ?? ""} readOnly={!isAdmin} companyName={company.name} />
      {company.emailMethod === "DOMAIN" && (
        <Card className="mt-6" title={<>DNS records for {domain} <Term k="spf">(what is this?)</Term></>}>
          <p className="mb-3 text-sm text-muted">Add these at your domain host (GoDaddy, Cloudflare, Google Domains…). Until they verify, RFQs go out through {PRODUCT_NAME} sending automatically.</p>
          <table className="tbl">
            <thead><tr><th>Type</th><th>Host / name</th><th>Value</th></tr></thead>
            <tbody>{records.map((r) => <tr key={r.host}><td>{r.type}</td><td className="font-mono text-xs">{r.host}</td><td className="font-mono text-xs">{r.value}</td></tr>)}</tbody>
          </table>
          <a className="btn btn-secondary btn-sm mt-3" href={`mailto:?subject=${encodeURIComponent(`DNS records for ${PRODUCT_NAME} email`)}&body=${encodeURIComponent("Please add these DNS records:\n\n" + records.map((r) => `${r.type}  ${r.host}  ${r.value}`).join("\n"))}`}>Send these to my IT / web person</a>
        </Card>
      )}
      <StepNav current="email" />
    </>
  );
}
