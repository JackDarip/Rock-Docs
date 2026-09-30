"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadQuotes, pasteQuoteText } from "@/app/actions/rfq";
import { FilePicker } from "./FilePicker";

export function QuoteUpload({ projectId, suppliers }: { projectId: string; suppliers: { id: string; name: string }[] }) {
  const [msgs, setMsgs] = useState<{ file: string; status: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <form className="rounded-2xl border-2 border-dashed border-mist bg-white p-6" action={async (fd) => {
      setBusy(true);
      try { setMsgs(await uploadQuotes(projectId, fd)); } finally { setBusy(false); }
      router.refresh();
    }}>
      <div className="font-display text-2xl font-bold">Bring in supplier quotes</div>
      <p className="mt-1 text-sm text-muted">Drop several at once: filled-in RFQ spreadsheets (.xlsx) match by RFQ number and hidden line IDs; suppliers&apos; own PDF quotes (even scanned) are read by AI. Every quote goes to review before any price is used.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <FilePicker name="files" multiple accept=".xlsx,.pdf" required label="Choose quote files" />
        <select name="supplierId" className="input w-64"><option value="">Supplier: detect from the file</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <button className="btn btn-primary" disabled={busy}>{busy ? "Uploading…" : "Upload quotes"}</button>
      </div>
      {msgs.length > 0 && <ul className="mt-3 space-y-1 text-sm">{msgs.map((m, i) => <li key={i}><strong>{m.file}:</strong> <span className="text-muted">{m.status}</span></li>)}</ul>}
      <PasteQuote projectId={projectId} suppliers={suppliers} />
    </form>
  );
}

function PasteQuote({ projectId, suppliers }: { projectId: string; suppliers: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sup, setSup] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  if (!open) return <button type="button" className="mt-3 text-sm font-semibold text-navy-700 hover:underline" onClick={() => setOpen(true)}>Quote came in an email? Paste it here</button>;
  return (
    <div className="mt-4 border-t border-line pt-4">
      <label className="label" htmlFor="paste-quote">Paste or forward the email text (prices, terms, validity)</label>
      <textarea id="paste-quote" className="input font-mono text-xs" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"From: sam@ferguson.com\nSubject: RE: RFQ IR-2026-0142-PIPE-R0\n\n12\" C900 DR18 — 1,850 LF @ $14.00\nFreight included. Valid 30 days."} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select aria-label="Supplier" className="input w-64" value={sup} onChange={(e) => setSup(e.target.value)}><option value="">Supplier: detect from the text</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); const r = await pasteQuoteText(projectId, text, sup || null); setBusy(false); setMsg(r.ok ? "Reading it now. It shows up below for review." : `⚠ ${r.error}`); if (r.ok) setText(""); router.refresh(); }}>{busy ? "Sending…" : "Read this quote"}</button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {msg && <p className={`mt-1 text-sm ${msg.startsWith("⚠") ? "text-warn" : "text-muted"}`}>{msg}</p>}
    </div>
  );
}
