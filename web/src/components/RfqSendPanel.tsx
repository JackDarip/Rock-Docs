"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewRfqEmails, sendRfqEmails } from "@/app/actions/send";
import { PRODUCT_NAME } from "@/config/brand";

export type SendSupplier = { id: string; name: string; preferred: boolean; suggested: boolean; servesArea: boolean; contacts: { name: string; email: string }[] };
type Target = { supplierId: string | null; name: string; email: string; contactName: string | null; saveToDirectory?: boolean };
type Preview = Awaited<ReturnType<typeof previewRfqEmails>>;

const HOUR_CHOICES = [168, 72, 48, 24, 4];
const hoursLabel = (h: number) => (h % 24 === 0 ? `${h / 24} day${h === 24 ? "" : "s"}` : `${h} hours`);

export function RfqSendPanel({ rfqId, suppliers, draft, reminderHours, alreadySent, onClose }: {
  rfqId: string; suppliers: SendSupplier[]; draft: { subject: string; body: string }; reminderHours: number[]; alreadySent: string[]; onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState<Record<string, string>>({}); // supplierId -> email
  const [extra, setExtra] = useState({ name: "", email: "", save: true });
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [hours, setHours] = useState<number[]>(reminderHours);
  const [preview, setPreview] = useState<Extract<Preview, { ok: true }> | null>(null);
  const [approved, setApproved] = useState<Record<number, boolean>>({});
  const [open, setOpen] = useState(0);
  const [overflow, setOverflow] = useState(true);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ name: string; email: string; method: string; note: string | null }[] | null>(null);

  const targets = (): Target[] => [
    ...suppliers.filter((s) => chosen[s.id]).map((s) => ({ supplierId: s.id, name: s.name, email: chosen[s.id], contactName: s.contacts.find((c) => c.email === chosen[s.id])?.name ?? null })),
    ...(extra.name && extra.email ? [{ supplierId: null, name: extra.name, email: extra.email, contactName: null, saveToDirectory: extra.save }] : []),
  ];
  const ordered = [...suppliers].sort((a, b) => Number(b.suggested) - Number(a.suggested) || Number(b.servesArea) - Number(a.servesArea) || Number(b.preferred) - Number(a.preferred) || a.name.localeCompare(b.name));

  const doPreview = () => start(async () => {
    setErr("");
    const r = await previewRfqEmails(rfqId, targets(), { subject, body });
    if (!r.ok) { setErr(r.error); return; }
    setPreview(r); setOpen(0);
    setApproved(Object.fromEntries(r.previews.map((_, i) => [i, true])));
  });
  const doSend = () => start(async () => {
    if (!preview) return;
    const list = preview.previews.filter((_, i) => approved[i]).map(({ supplierId, name, email, contactName, saveToDirectory }) => ({ supplierId, name, email, contactName, saveToDirectory }));
    if (!list.length) { setErr("Approve at least one email"); return; }
    const r = await sendRfqEmails(rfqId, list, { subject, body }, hours, overflow);
    if (!r.ok) { setErr(r.error); return; }
    setDone(r.results); router.refresh();
  });

  if (done) {
    return (
      <div className="mt-4 rounded-xl border border-mist bg-white p-4">
        <div className="font-semibold">Queued {done.filter((d) => d.method !== "SKIPPED").length} email{done.length === 1 ? "" : "s"}</div>
        <ul className="mt-2 space-y-1 text-sm">
          {done.map((d, i) => (
            <li key={i}>{d.method === "SKIPPED" ? "⚠ Not sent" : d.method === "LOG" ? "⚠ Saved, not delivered" : "✓"} {d.name} &lt;{d.email}&gt;{d.note && <span className="block text-xs text-warn">{d.note}</span>}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Status updates below as each one goes out. Reminders are scheduled {hours.length ? hours.map(hoursLabel).join(" and ") + " before quotes are due" : "— none"}.</p>
        <button className="btn btn-secondary btn-sm mt-3" onClick={onClose}>Done</button>
      </div>
    );
  }

  if (preview) {
    const p = preview.previews[open];
    const count = Object.values(approved).filter(Boolean).length;
    return (
      <div className="mt-4 rounded-xl border border-mist bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="font-semibold">Review each email before it goes out</div>
            <div className="text-sm text-muted">From <strong>{preview.route.from}</strong> · replies go to {preview.route.replyTo}</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setPreview(null)}>← Edit</button>
        </div>
        {preview.route.note && <p className="mt-2 rounded-lg border border-warn-line bg-warn-bg p-2 text-sm text-warn">⚠ {preview.route.note}</p>}
        {preview.route.limit && (preview.route.nearLimit || preview.route.overLimit > 0) && (
          <div className="mt-2 rounded-lg border border-warn-line bg-warn-bg p-2 text-sm text-warn">
            ⚠ {preview.route.from} has sent {preview.route.limit.used} of its {preview.route.limit.max} emails allowed per day.
            {preview.route.overLimit > 0 && <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={overflow} onChange={(e) => setOverflow(e.target.checked)} />Send the {preview.route.overLimit} over the limit through {PRODUCT_NAME} sending instead</label>}
          </div>
        )}
        <div className="mt-3 grid gap-3 lg:grid-cols-[16rem_1fr]">
          <ul className="space-y-1">
            {preview.previews.map((x, i) => (
              <li key={i} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${open === i ? "bg-paper ring-1 ring-mist" : ""}`}>
                <input type="checkbox" aria-label={`Approve email to ${x.name}`} checked={!!approved[i]} onChange={(e) => setApproved({ ...approved, [i]: e.target.checked })} />
                <button className="min-w-0 flex-1 truncate text-left" onClick={() => setOpen(i)}><strong>{x.name}</strong><span className="block truncate text-xs text-muted">{x.email}</span></button>
              </li>
            ))}
          </ul>
          <div className="min-w-0 rounded-lg border border-line">
            <div className="border-b border-line px-3 py-2 text-sm"><span className="text-muted">To:</span> {p.email} · <span className="text-muted">Subject:</span> {p.subject} · <span className="text-muted">Attachment:</span> {p.name} RFQ spreadsheet</div>
            <iframe title={`Email to ${p.name}`} srcDoc={p.html} sandbox="" className="h-[26rem] w-full" />
            <p className="border-t border-line px-3 py-1.5 text-xs text-muted">The quote-form and decline links are created for each supplier when you send.</p>
          </div>
        </div>
        {err && <p className="mt-2 text-sm text-warn">⚠ {err}</p>}
        <button className="btn btn-primary mt-3" disabled={pending || !count} onClick={doSend}>{pending ? "Sending…" : `Send ${count} approved email${count === 1 ? "" : "s"}`}</button>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-mist bg-white p-4">
      <div className="mb-2 font-semibold">Who should get this RFQ?</div>
      {suppliers.length === 0 && <p className="text-sm text-muted">No suppliers in your directory yet. <a className="text-navy-700 underline" href="/setup/suppliers">Add suppliers</a>, or type someone below.</p>}
      <ul className="grid gap-1.5 md:grid-cols-2">
        {ordered.map((s) => (
          <li key={s.id} className={`rounded-lg border px-3 py-2 text-sm ${chosen[s.id] ? "border-brand bg-brand-50" : "border-line"}`}>
            <label className="flex items-center gap-2">
              <input type="checkbox" disabled={!s.contacts.length} checked={!!chosen[s.id]}
                onChange={(e) => { const next = { ...chosen }; if (e.target.checked) next[s.id] = s.contacts[0].email; else delete next[s.id]; setChosen(next); }} />
              <span className="font-semibold">{s.name}</span>
              {s.preferred && <span title="Preferred supplier">★</span>}
              {s.suggested && <span className="flag flag-info">Supplies this</span>}
              {s.servesArea && <span className="flag flag-ok">Serves this area</span>}
              {alreadySent.includes(s.id) && <span className="flag flag-warn">Already sent</span>}
            </label>
            {!s.contacts.length ? (
              <p className="ml-6 text-xs text-muted">No email on file. <a className="underline" href="/setup/suppliers">Add a contact</a></p>
            ) : chosen[s.id] && s.contacts.length > 1 ? (
              <select className="cell-input ml-6 mt-1 w-auto text-xs" value={chosen[s.id]} onChange={(e) => setChosen({ ...chosen, [s.id]: e.target.value })}>
                {s.contacts.map((c) => <option key={c.email} value={c.email}>{c.name} &lt;{c.email}&gt;</option>)}
              </select>
            ) : <p className="ml-6 truncate text-xs text-muted">{s.contacts[0].name} &lt;{s.contacts[0].email}&gt;</p>}
          </li>
        ))}
      </ul>
      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
        <input className="input" placeholder="Someone else: company or name" value={extra.name} onChange={(e) => setExtra({ ...extra, name: e.target.value })} />
        <input className="input" type="email" placeholder="Their email" value={extra.email} onChange={(e) => setExtra({ ...extra, email: e.target.value })} />
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={extra.save} onChange={(e) => setExtra({ ...extra, save: e.target.checked })} />Save to directory</label>
      </div>
      <div className="mt-4 grid gap-3">
        <div><label className="label" htmlFor={`subj-${rfqId}`}>Subject</label><input id={`subj-${rfqId}`} className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
        <div><label className="label" htmlFor={`body-${rfqId}`}>Message</label><textarea id={`body-${rfqId}`} className="input" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="mt-1 text-xs text-muted">Each email adds a greeting, a secure no-login link to an online quote form, a &quot;can&apos;t quote&quot; link, and the spreadsheet pre-filled with that supplier&apos;s name.</p></div>
        <div>
          <div className="label">Remind suppliers who haven&apos;t responded</div>
          <div className="flex flex-wrap gap-1.5">
            {HOUR_CHOICES.map((h) => (
              <button key={h} type="button" onClick={() => setHours(hours.includes(h) ? hours.filter((x) => x !== h) : [...hours, h].sort((a, b) => b - a))}
                className={`rounded-full border px-3 py-1 text-xs ${hours.includes(h) ? "border-brand bg-brand-50 text-brand-600" : "border-line text-muted"}`}>{hoursLabel(h)} before due</button>
            ))}
          </div>
        </div>
      </div>
      {err && <p className="mt-2 text-sm text-warn">⚠ {err}</p>}
      <div className="mt-4 flex gap-2">
        <button className="btn btn-primary" disabled={pending || !targets().length} onClick={doPreview}>{pending ? "Preparing…" : `Preview ${targets().length || ""} email${targets().length === 1 ? "" : "s"}`}</button>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
