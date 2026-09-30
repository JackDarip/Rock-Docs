"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setupDomain, verifyDomain, sendDnsInstructions, setReminderHours, disconnectMailbox } from "@/app/actions/send";

type Rec = { record: string; type: string; name: string; value: string; priority?: number; found?: boolean };

export function DomainSetup({ domain, fromLocal, records, verifiedAt, status, checkedAt, readOnly }: {
  domain: string; fromLocal: string; records: Rec[]; verifiedAt: string | null; status: string | null; checkedAt: string | null; readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [d, setD] = useState(domain);
  const [local, setLocal] = useState(fromLocal);
  const [msg, setMsg] = useState("");
  const [it, setIt] = useState("");
  const [copied, setCopied] = useState("");
  const copy = async (v: string, k: string) => { await navigator.clipboard.writeText(v); setCopied(k); setTimeout(() => setCopied(""), 1500); };
  return (
    <div className="space-y-4">
      <form className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto] md:items-end" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await setupDomain(d, local); setMsg(r.ok ? "Saved. Add the records below at your DNS host, then click Verify." : `⚠ ${r.error}`); router.refresh(); }); }}>
        <div><label className="label" htmlFor="from-local">Send as</label><input id="from-local" className="input" value={local} disabled={readOnly} onChange={(e) => setLocal(e.target.value)} placeholder="bids" /></div>
        <span className="pb-2 text-lg text-muted">@</span>
        <div><label className="label" htmlFor="domain">Your domain</label><input id="domain" className="input" value={d} disabled={readOnly} onChange={(e) => setD(e.target.value)} placeholder="yourcompany.com" /></div>
        <button className="btn btn-primary" disabled={readOnly || pending}>{records.length ? "Update" : "Get DNS records"}</button>
      </form>
      {msg && <p className={`text-sm ${msg.startsWith("⚠") ? "text-warn" : "text-ok"}`}>{msg}</p>}
      {records.length > 0 && (
        <>
          <div className={`rounded-lg border p-3 text-sm ${verifiedAt ? "border-emerald-200 bg-ok-bg text-ok" : "border-warn-line bg-warn-bg text-warn"}`}>
            {verifiedAt ? <>✓ Verified. RFQs now send from <strong>{local}@{domain}</strong>.</> : <>⚠ Not verified yet{status ? ` (provider says: ${status})` : ""}. Until it is, RFQs go out through platform sending automatically.</>}
            {checkedAt && <span className="block text-xs opacity-80">Last checked {new Date(checkedAt).toLocaleString()}</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Type</th><th>Host / name</th><th>Value</th><th>Found in DNS</th></tr></thead>
              <tbody>{records.map((r, i) => (
                <tr key={i}>
                  <td>{r.type}{r.priority != null ? ` (${r.priority})` : ""}</td>
                  <td className="font-mono text-xs"><button type="button" className="text-left hover:underline" title="Copy" onClick={() => copy(r.name, `n${i}`)}>{r.name}</button> {copied === `n${i}` && <span className="text-ok">Copied</span>}</td>
                  <td className="max-w-md break-all font-mono text-xs"><button type="button" className="text-left hover:underline" title="Copy" onClick={() => copy(r.value, `v${i}`)}>{r.value}</button> {copied === `v${i}` && <span className="text-ok">Copied</span>}</td>
                  <td>{r.found == null ? <span className="text-muted">not checked</span> : r.found ? <span className="flag flag-ok">✓ Found</span> : <span className="flag flag-warn">Not yet</span>}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">Click any name or value to copy it. DNS changes can take a few minutes to 48 hours to show up.</p>
          <div className="flex flex-wrap items-end gap-3">
            <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => { const r = await verifyDomain(); setMsg(r.ok ? (r.verified ? "✓ Verified" : `${r.found} of ${r.total} records found so far.`) : `⚠ ${r.error}`); router.refresh(); })}>{pending ? "Checking…" : "Verify"}</button>
            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await sendDnsInstructions(it); setMsg(r.ok ? (r.delivered ? `Sent the instructions to ${it}.` : `⚠ ${r.note}`) : `⚠ ${r.error}`); }); }}>
              <div><label className="label" htmlFor="it-email">Send these instructions to my IT / web person</label><input id="it-email" type="email" className="input w-72" value={it} onChange={(e) => setIt(e.target.value)} placeholder="it@yourcompany.com" /></div>
              <button className="btn btn-secondary" disabled={pending || readOnly}>Send</button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

export function MailboxCard({ connection, google, microsoft }: {
  connection: { provider: string; email: string; used: number; limit: number; lastError: string | null } | null; google: boolean; microsoft: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (connection) {
    const pct = Math.round((connection.used / connection.limit) * 100);
    return (
      <div className="space-y-2 text-sm">
        <p>✓ Connected: <strong>{connection.email}</strong> ({connection.provider === "GOOGLE" ? "Google" : "Microsoft"}). Your RFQs send from this mailbox and show up in its Sent folder.</p>
        <div>
          <div className="flex justify-between text-xs text-muted"><span>Sent in the last 24 hours</span><span>{connection.used} of {connection.limit}</span></div>
          <div className="mt-1 h-2 rounded-full bg-line"><div className={`h-2 rounded-full ${pct >= 80 ? "bg-amber-500" : "bg-brand"}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
          {pct >= 80 && <p className="mt-1 text-xs text-warn">⚠ Close to the provider&apos;s daily limit. Extra RFQs can go through platform sending instead.</p>}
        </div>
        {connection.lastError && <p className="text-xs text-warn">⚠ {connection.lastError}</p>}
        <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => { await disconnectMailbox(); router.refresh(); })}>Disconnect</button>
      </div>
    );
  }
  return (
    <div className="space-y-2 text-sm">
      <p>Connect your own mailbox. Each estimator connects their own; until you do, your RFQs go out through platform sending.</p>
      <div className="flex flex-wrap gap-2">
        {google ? <a className="btn btn-secondary" href="/api/oauth/google/start">Connect Google / Gmail</a> : <span className="btn btn-secondary pointer-events-none opacity-50" aria-disabled>Connect Google / Gmail</span>}
        {microsoft ? <a className="btn btn-secondary" href="/api/oauth/microsoft/start">Connect Microsoft / Outlook</a> : <span className="btn btn-secondary pointer-events-none opacity-50" aria-disabled>Connect Microsoft / Outlook</span>}
      </div>
      {(!google || !microsoft) && <p className="text-xs text-muted">{!google && !microsoft ? "Google and Microsoft sign-in aren't" : !google ? "Google sign-in isn't" : "Microsoft sign-in isn't"} switched on for this server yet. Your platform administrator adds the OAuth app keys (see the README).</p>}
    </div>
  );
}

const CHOICES = [168, 72, 48, 24, 4];
export function ReminderDefaults({ hours, readOnly }: { hours: number[]; readOnly: boolean }) {
  const [h, setH] = useState(hours);
  const [, start] = useTransition();
  const toggle = (x: number) => { const next = h.includes(x) ? h.filter((y) => y !== x) : [...h, x].sort((a, b) => b - a); setH(next); start(async () => { await setReminderHours(next); }); };
  return (
    <div className="flex flex-wrap gap-1.5">
      {CHOICES.map((x) => (
        <button key={x} type="button" disabled={readOnly} onClick={() => toggle(x)} className={`rounded-full border px-3 py-1 text-xs ${h.includes(x) ? "border-brand bg-brand-50 text-brand-600" : "border-line text-muted"}`}>
          {x % 24 === 0 ? `${x / 24} day${x === 24 ? "" : "s"}` : `${x} hours`} before due
        </button>
      ))}
    </div>
  );
}
