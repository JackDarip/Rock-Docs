"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markSent, setRecipientStatus } from "@/app/actions/rfq";
import { Icon } from "@/components/Icon";

type Supplier = { id: string; name: string; email: string | null; categories: string[]; preferred: boolean; serviceArea: string | null };
type Recipient = { id: string; name: string; email: string | null; method: string; status: string; sentAt: string; token: string; supplierId: string | null };

export function RfqCard(props: {
  rfq: { id: string; number: string; categoryCode: string; categoryName: string; revision: number; lineCount: number; changedAfterDownload: boolean; downloads: { who: string; when: string; format: string; revision: number }[] };
  suppliers: Supplier[]; recipients: Recipient[]; email: { subject: string; body: string }; quoteDue: string | null; baseUrl: string;
}) {
  const { rfq, suppliers, recipients, email, baseUrl } = props;
  const router = useRouter();
  const [, start] = useTransition();
  const [copied, setCopied] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [manual, setManual] = useState({ name: "", email: "", save: true });
  const [sentAt, setSentAt] = useState("");
  const [showSend, setShowSend] = useState(false);
  const suggested = suppliers.filter((s) => rfq.categoryCode === "ALL" || s.categories.includes(rfq.categoryCode));
  const others = suppliers.filter((s) => !suggested.includes(s));
  const dl = (format: string, supplierId?: string) => `/api/rfqs/${rfq.id}/download?format=${format}${supplierId ? `&supplierId=${supplierId}` : ""}`;
  const copy = async (text: string, what: string) => { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(""), 2000); };
  const pickedEmails = suppliers.filter((s) => picked.includes(s.id)).map((s) => s.email).filter(Boolean).join(",");
  const mailto = `mailto:${pickedEmails}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;

  const record = () => start(async () => {
    const list = [
      ...suppliers.filter((s) => picked.includes(s.id)).map((s) => ({ supplierId: s.id, name: s.name, email: s.email })),
      ...(manual.name ? [{ supplierId: null, name: manual.name, email: manual.email || null, saveToDirectory: manual.save }] : []),
    ];
    if (!list.length) return;
    await markSent(rfq.id, list, sentAt ? new Date(sentAt).toISOString() : null);
    setPicked([]); setManual({ name: "", email: "", save: true }); setShowSend(false);
    router.refresh();
  });

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-sm font-semibold text-brand-600">{rfq.number}</div>
          <div className="text-xl font-bold">{rfq.categoryName}</div>
          <div className="text-sm text-muted">Revision {rfq.revision} · {rfq.lineCount} lines</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-primary" href={dl("xlsx")}><Icon name="download" size={16} />Download Excel</a>
          <a className="btn btn-secondary" href={dl("pdf")}>PDF</a>
          <a className="btn btn-secondary" href={dl("csv")}>CSV</a>
        </div>
      </div>
      {rfq.changedAfterDownload && (
        <div className="mt-3 rounded-lg border border-warn-line bg-warn-bg p-2 text-sm text-warn">⚠ This RFQ changed after you downloaded it. Click &quot;Generate / refresh RFQs&quot; above to create Revision {rfq.revision + 1}.</div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <div className="label">Send it yourself</div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => copy(`Subject: ${email.subject}\n\n${email.body}`, "email")}>{copied === "email" ? "Copied ✓" : "Copy email text"}</button>
            <a className="btn btn-secondary btn-sm" href={mailto}>Open in my email</a>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowSend(!showSend)}>Mark as sent…</button>
          </div>
          <p className="mt-1 text-xs text-muted">&quot;Open in my email&quot; can&apos;t attach files. Download the Excel file and attach it yourself. Forward it to anyone, in or out of your directory.</p>
          {suggested.length > 0 && (
            <div className="mt-3">
              <div className="label">Per-supplier copies (name pre-filled so returns match automatically)</div>
              <div className="flex flex-wrap gap-1">
                {suggested.map((s) => <a key={s.id} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs hover:border-brand" href={dl("xlsx", s.id)}><Icon name="download" size={13} />{s.name}{s.preferred ? " ★" : ""}</a>)}
              </div>
            </div>
          )}
        </div>
        <div>
          <div className="label">Sent to</div>
          {recipients.length === 0 ? <p className="text-sm text-muted">Not sent yet.</p> : (
            <ul className="space-y-1 text-sm">
              {recipients.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-paper px-2 py-1">
                  <span><strong>{r.name}</strong> <span className="text-xs text-muted">{new Date(r.sentAt).toLocaleDateString()} · {r.method === "OUTSIDE" ? "Sent outside TrueGrade (no open tracking)" : "Sent from TrueGrade"}</span></span>
                  <span className="flex items-center gap-2">
                    <select className="cell-input text-xs" value={r.status} onChange={(e) => start(async () => { await setRecipientStatus(r.id, e.target.value as any); router.refresh(); })}>
                      <option value="SENT">Sent</option><option value="RESPONDED">Responded</option><option value="DECLINED">Declined</option>
                    </select>
                    <button className="text-xs text-navy-700 hover:underline" title="Secure no-login link where this supplier can type prices" onClick={() => copy(`${baseUrl}/q/${r.token}`, r.id)}>{copied === r.id ? "Copied ✓" : "Copy quote-form link"}</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {showSend && (
        <div className="mt-4 rounded-xl border border-mist bg-white p-4">
          <div className="mb-2 font-semibold">Who did you send it to?</div>
          <div className="flex flex-wrap gap-2">
            {[...suggested, ...others].map((s) => (
              <label key={s.id} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm ${suggested.includes(s) ? "border-mist" : "border-line text-muted"}`}>
                <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((x) => x !== s.id))} />{s.name}
              </label>
            ))}
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <input className="input" placeholder="Someone else: name" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} />
            <input className="input" placeholder="Email (optional)" value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value })} />
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={manual.save} onChange={(e) => setManual({ ...manual, save: e.target.checked })} />Save to supplier directory</label>
            <input className="input" type="datetime-local" value={sentAt} onChange={(e) => setSentAt(e.target.value)} title="When it was sent (defaults to now)" />
          </div>
          <button className="btn btn-primary btn-sm mt-3" onClick={record}>Record as sent</button>
        </div>
      )}

      {rfq.downloads.length > 0 && (
        <details className="mt-3 text-xs text-muted">
          <summary className="cursor-pointer">Download log ({rfq.downloads.length})</summary>
          <ul className="mt-1">{rfq.downloads.map((d, i) => <li key={i}>{d.when} · {d.who} · {d.format.toUpperCase()} · R{d.revision}</li>)}</ul>
        </details>
      )}
    </section>
  );
}
