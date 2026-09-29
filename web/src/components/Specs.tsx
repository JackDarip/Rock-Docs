"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runSpecExtraction, addRequirement, decideRequirement } from "@/app/actions/specs";

type Item = { id: string; itemNumber: string; description: string };

export function RunSpecs({ projectId, disabled, note }: { projectId: string; disabled: boolean; note: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <div>
      <button className="btn btn-primary" disabled={pending || disabled} onClick={() => start(async () => { const r = await runSpecExtraction(projectId); setMsg(r.ok ? "Reading the specifications… results appear below." : `⚠ ${r.error}`); router.refresh(); })}>Read specifications with AI</button>
      <p className="mt-1 text-xs text-muted">{note}</p>
      {msg && <p className={`mt-1 text-sm ${msg.startsWith("⚠") ? "text-warn" : "text-muted"}`}>{msg}</p>}
    </div>
  );
}

export function ReqRow({ r, items }: { r: { id: string; bidItemId: string | null; material: string | null; requirement: string; status: string; confidence: string; specSection: string | null; source: string; page: string | null }; items: Item[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(r.requirement);
  const [bi, setBi] = useState(r.bidItemId ?? "");
  const decide = (status: "CONFIRMED" | "REJECTED") => start(async () => { await decideRequirement(r.id, status, edit ? { requirement: text, bidItemId: bi || null } : undefined); setEdit(false); router.refresh(); });
  return (
    <li className={`rounded-lg border p-2 text-sm ${r.status === "DRAFT" ? (r.confidence === "LOW" ? "border-amber-300 bg-amber-50" : "border-mist bg-white") : "border-line bg-paper"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {r.material && <strong>{r.material}: </strong>}
          {edit ? <textarea className="input mt-1" rows={2} value={text} onChange={(e) => setText(e.target.value)} /> : r.requirement}
          <div className="text-xs text-muted">{r.specSection ? `§${r.specSection} · ` : ""}{r.page ? `${r.page} · ` : ""}{r.source === "AI" ? (r.status === "DRAFT" ? "AI draft, needs your OK" : "AI, confirmed") : "Entered by hand"}</div>
          {edit && <select className="cell-input mt-1 w-auto" value={bi} onChange={(e) => setBi(e.target.value)}><option value="">— no bid item —</option>{items.map((i) => <option key={i.id} value={i.id}>{i.itemNumber} {i.description}</option>)}</select>}
        </div>
        {r.status === "DRAFT" ? (
          <span className="flex gap-1.5">
            <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => decide("CONFIRMED")}>{edit ? "Save & confirm" : "Confirm"}</button>
            {!edit && <button className="btn btn-secondary btn-sm" onClick={() => setEdit(true)}>Edit</button>}
            <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => decide("REJECTED")}>Reject</button>
          </span>
        ) : <span className="text-xs text-ok">✓ On the material list</span>}
      </div>
    </li>
  );
}

export function AddRequirement({ projectId, items, preset }: { projectId: string; items: Item[]; preset?: { bidItemId?: string; specSection?: string } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState({ bidItemId: preset?.bidItemId ?? items[0]?.id ?? "", specSection: preset?.specSection ?? "", material: "", requirement: "" });
  const [err, setErr] = useState("");
  return (
    <form className="grid gap-2 md:grid-cols-[14rem_7rem_12rem_1fr_auto] md:items-end" onSubmit={(e) => { e.preventDefault(); setErr(""); start(async () => { const r = await addRequirement(projectId, { ...v, bidItemId: v.bidItemId || null, specSection: v.specSection || null, material: v.material || null }); if (!r.ok) setErr(r.error); else { setV({ ...v, material: "", requirement: "" }); router.refresh(); } }); }}>
      <div><label className="label" htmlFor="rq-bi">Bid item</label><select id="rq-bi" className="input" value={v.bidItemId} onChange={(e) => setV({ ...v, bidItemId: e.target.value })}><option value="">— none —</option>{items.map((i) => <option key={i.id} value={i.id}>{i.itemNumber} {i.description}</option>)}</select></div>
      <div><label className="label" htmlFor="rq-sec">Section</label><input id="rq-sec" className="input" value={v.specSection} onChange={(e) => setV({ ...v, specSection: e.target.value })} placeholder="33 11 00" /></div>
      <div><label className="label" htmlFor="rq-mat">Material</label><input id="rq-mat" className="input" value={v.material} onChange={(e) => setV({ ...v, material: e.target.value })} placeholder="PVC water pipe" /></div>
      <div><label className="label" htmlFor="rq-req">Requirement</label><input id="rq-req" className="input" value={v.requirement} onChange={(e) => setV({ ...v, requirement: e.target.value })} placeholder="AWWA C900 DR18, pressure class 235" /></div>
      <button className="btn btn-secondary" disabled={pending}>Add</button>
      {err && <p className="text-sm text-warn md:col-span-5">⚠ {err}</p>}
    </form>
  );
}
