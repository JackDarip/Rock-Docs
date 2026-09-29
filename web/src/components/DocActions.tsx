"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDocumentKind, deleteDocument, acknowledgeAddendum, runBidScheduleExtraction, aiCostPreview } from "@/app/actions/project";

export const DOC_KINDS: [string, string][] = [
  ["PLANS", "Plan set"], ["BID_SCHEDULE", "Bid schedule / form"], ["SPECS", "Specifications"], ["GEOTECH", "Geotech report"],
  ["ADDENDUM", "Addendum"], ["CAD", "CAD / LandXML"], ["QUOTE", "Supplier quote"], ["OTHER", "Other"],
];

export function DocKind({ id, kind, confirmed, suggested, addendumNumber }: { id: string; kind: string; confirmed: boolean; suggested: string | null; addendumNumber: number | null }) {
  const [k, setK] = useState(kind);
  const [n, setN] = useState(addendumNumber ?? "");
  const router = useRouter();
  const [, start] = useTransition();
  const save = (nk: string, num?: number | null) => start(async () => { await setDocumentKind(id, nk, num); router.refresh(); });
  return (
    <div className="flex items-center gap-1">
      <select className="cell-input" value={k} onChange={(e) => { setK(e.target.value); save(e.target.value, n === "" ? null : Number(n)); }}>
        {DOC_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {k === "ADDENDUM" && <input className="cell-input w-14" placeholder="#" value={n} onChange={(e) => setN(e.target.value)} onBlur={() => save(k, n === "" ? null : Number(n))} />}
      {!confirmed && suggested && (
        <button className="flag flag-warn whitespace-nowrap" title="Suggested from the file name and contents" onClick={() => save(k, n === "" ? null : Number(n))}>Confirm?</button>
      )}
    </div>
  );
}

export function AckAddendum({ id, acknowledged }: { id: string; acknowledged: boolean }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-1 text-xs">
      <input type="checkbox" defaultChecked={acknowledged} onChange={async (e) => { await acknowledgeAddendum(id, e.target.checked); router.refresh(); }} />
      Acknowledged on bid form
    </label>
  );
}

export function DeleteDoc({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return <button className="text-xs text-faint hover:text-danger" onClick={async () => { if (confirm(`Delete ${name}? Markups on it are deleted too.`)) { await deleteDocument(id); router.refresh(); } }}>Delete</button>;
}

export function ExtractSchedule({ id, pageCount }: { id: string; pageCount: number | null }) {
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState("");
  const [preview, setPreview] = useState<{ usd: number; seconds: number; pages: number; enabled: boolean } | null>(null);
  const [msg, setMsg] = useState("");
  const router = useRouter();
  const parse = () => {
    const out: number[] = [];
    for (const part of pages.split(",").map((s) => s.trim()).filter(Boolean)) {
      const [a, b] = part.split("-").map(Number);
      if (b) for (let i = a; i <= b; i++) out.push(i); else if (a) out.push(a);
    }
    return out.length ? out : null;
  };
  return (
    <>
      <button className="btn btn-secondary btn-sm" onClick={async () => { setOpen(!open); setPreview(await aiCostPreview(id, parse())); }}>Extract bid schedule</button>
      {open && (
        <div className="mt-2 w-80 rounded-xl border border-line bg-white p-3 text-left text-sm shadow-lg">
          <p className="text-muted">Which pages hold the bid schedule? Leave blank for all {pageCount ?? ""} pages.</p>
          <input className="input mt-2" placeholder="e.g. 3-5" value={pages} onChange={(e) => setPages(e.target.value)} onBlur={async () => setPreview(await aiCostPreview(id, parse()))} />
          {preview && (preview.enabled
            ? <p className="mt-2 text-xs">About <strong>${preview.usd.toFixed(2)}</strong> and ~{Math.ceil(preview.seconds / 60)} min for {preview.pages} page(s). Results arrive as drafts for your review.</p>
            : <p className="mt-2 text-xs text-warn">⚠ AI extraction isn&apos;t configured on this server. Import the schedule from Excel/CSV or type it in on Bid items.</p>)}
          <button className="btn btn-primary btn-sm mt-2" disabled={!preview?.enabled} onClick={async () => {
            const r = await runBidScheduleExtraction(id, parse());
            setMsg(r.ok ? "Queued. Bid items will appear as AI drafts." : `⚠ ${r.error}`);
            router.refresh();
          }}>Run extraction</button>
          {msg && <p className="mt-2 text-xs">{msg}</p>}
        </div>
      )}
    </>
  );
}
