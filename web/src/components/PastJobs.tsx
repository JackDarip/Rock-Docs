"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadJobFiles, saveJobLine, setJobLineStatus, deleteJobLine, createRateForLine, markJobReviewed, refreshCalibration, decideCalibration, deleteJob } from "@/app/actions/jobs";
import { FilePicker } from "./FilePicker";

type Rate = { id: string; activity: string; unit: string };
type Line = {
  id: string; activity: string; quantity: number | null; unit: string | null; estimatedCost: number | null; actualCost: number | null;
  estimatedHours: number | null; actualHours: number | null; productionRateId: string | null; confidence: string; aiExtracted: boolean;
  status: string; source: { href: string; label: string } | null;
};
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[$,\s]/g, "")));
const fmt = (v: number | null) => (v == null ? "" : String(v));

export function JobUpload({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string[]>([]);
  return (
    <form className="flex flex-wrap items-end gap-3" action={(fd) => start(async () => { const r = await uploadJobFiles(jobId, fd); setMsg(r.ok ? r.results : [`⚠ ${r.error}`]); router.refresh(); })}>
      <div><label className="label" htmlFor="jf-role">What is it?</label>
        <select id="jf-role" name="role" className="input w-56"><option value="ACTUAL">Final job cost report</option><option value="ESTIMATE">Original bid estimate</option><option value="OTHER">Other</option></select></div>
      <div><div className="label">Files (PDF, Excel, CSV, photos of printed reports)</div><FilePicker name="files" multiple accept=".pdf,.xlsx,.csv,.png,.jpg,.jpeg" label="Choose files" /></div>
      <button className="btn btn-primary" disabled={pending}>{pending ? "Uploading…" : "Upload"}</button>
      {msg.length > 0 && <ul className="w-full text-xs text-muted">{msg.map((m, i) => <li key={i}>{m}</li>)}</ul>}
    </form>
  );
}

function Cell({ v, onSave, w = "w-24", right = true, label }: { v: string; onSave: (s: string) => void; w?: string; right?: boolean; label: string }) {
  const [x, setX] = useState(v);
  return <input aria-label={label} className={`cell-input ${w} ${right ? "text-right" : ""}`} value={x} onChange={(e) => setX(e.target.value)} onBlur={() => x !== v && onSave(x)} />;
}

export function JobLines({ jobId, lines, rates, isAdmin, kind }: { jobId: string; lines: Line[]; rates: Rate[]; isAdmin: boolean; kind: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  const save = (id: string, patch: Record<string, unknown>) => start(async () => { await saveJobLine(jobId, id, patch); router.refresh(); });
  const drafts = lines.filter((l) => l.status === "DRAFT");
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{drafts.length ? `${drafts.length} line${drafts.length === 1 ? "" : "s"} to review. Amber = the AI wasn't sure; check it against the source.` : "Every line is reviewed."} Map each activity to a production rate so it can calibrate that rate.</p>
        <div className="flex gap-2">
          {drafts.length > 0 && <button className="btn btn-secondary btn-sm" onClick={() => start(async () => { await setJobLineStatus(jobId, drafts.map((d) => d.id), "CONFIRMED"); router.refresh(); })}>Confirm all {drafts.length}</button>}
          <button className="btn btn-secondary btn-sm" onClick={() => start(async () => { await saveJobLine(jobId, null, { activity: "New activity" }); router.refresh(); })}>+ Add line</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Activity &amp; source</th><th className="text-right">Qty</th><th>Unit</th><th className="text-right">Est. $</th><th className="text-right">Actual $</th><th className="text-right">Est. hrs</th><th className="text-right">Actual hrs</th><th>Production rate</th><th /></tr></thead>
          <tbody>{lines.map((l) => (
            <tr key={l.id} className={l.status === "DRAFT" ? (l.confidence === "LOW" ? "row-warn" : "bg-brand-50/40") : l.status === "IGNORED" ? "opacity-50" : ""}>
              <td>
                <Cell label="Activity" v={l.activity} w="w-52" right={false} onSave={(s) => save(l.id, { activity: s })} />
                <div className="mt-0.5 truncate text-[11px] text-muted">{l.source ? <a className="text-navy-700 underline" href={l.source.href} target="_blank" rel="noreferrer">{l.source.label}</a> : kind === "CLOSEOUT" ? "From the estimate" : "Typed in"}{l.aiExtracted && <span className="ml-1 font-semibold text-warn">· AI{l.confidence === "LOW" ? ", unsure" : ""}</span>}</div>
              </td>
              <td><Cell label="Quantity" v={fmt(l.quantity)} w="w-20" onSave={(s) => save(l.id, { quantity: num(s) })} /></td>
              <td><Cell label="Unit" v={l.unit ?? ""} w="w-14" right={false} onSave={(s) => save(l.id, { unit: s || null })} /></td>
              <td><Cell label="Estimated cost" v={fmt(l.estimatedCost)} w="w-20" onSave={(s) => save(l.id, { estimatedCost: num(s) })} /></td>
              <td><Cell label="Actual cost" v={fmt(l.actualCost)} w="w-20" onSave={(s) => save(l.id, { actualCost: num(s) })} /></td>
              <td><Cell label="Estimated hours" v={fmt(l.estimatedHours)} w="w-16" onSave={(s) => save(l.id, { estimatedHours: num(s) })} /></td>
              <td><Cell label="Actual hours" v={fmt(l.actualHours)} w="w-16" onSave={(s) => save(l.id, { actualHours: num(s) })} /></td>
              <td>
                <select aria-label="Production rate" className="cell-input w-44" value={l.productionRateId ?? ""} onChange={(e) => {
                  if (e.target.value === "__new") start(async () => { await createRateForLine(jobId, l.id); router.refresh(); });
                  else save(l.id, { productionRateId: e.target.value || null });
                }}>
                  <option value="">— not mapped —</option>
                  {rates.map((r) => <option key={r.id} value={r.id}>{r.activity} ({r.unit})</option>)}
                  {isAdmin && <option value="__new">+ Create new rate from this line</option>}
                </select>
              </td>
              <td className="whitespace-nowrap">
                {l.status === "DRAFT" ? <button className="btn btn-primary btn-sm" onClick={() => start(async () => { await setJobLineStatus(jobId, [l.id], "CONFIRMED"); router.refresh(); })}>Confirm</button>
                  : <button className="text-xs text-muted hover:underline" onClick={() => start(async () => { await setJobLineStatus(jobId, [l.id], l.status === "IGNORED" ? "CONFIRMED" : "IGNORED"); router.refresh(); })}>{l.status === "IGNORED" ? "Use" : "Ignore"}</button>}
                <button className="ml-2 text-faint hover:text-danger" aria-label="Delete line" onClick={() => start(async () => { await deleteJobLine(jobId, l.id); router.refresh(); })}>✕</button>
              </td>
            </tr>))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function JobReviewed({ jobId, status }: { jobId: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => { const r = await markJobReviewed(jobId); setMsg(r.ok ? "Reviewed. Calibration suggestions updated." : `⚠ ${r.error}`); router.refresh(); })}>{status === "REVIEWED" ? "Update calibration" : "Done reviewing: use this job for calibration"}</button>
      <button className="text-sm text-faint hover:text-danger" onClick={() => { if (confirm("Delete this job and its lines?")) start(async () => { await deleteJob(jobId); }); }}>Delete job</button>
      {msg && <span className={`text-sm ${msg.startsWith("⚠") ? "text-warn" : "text-ok"}`}>{msg}</span>}
    </div>
  );
}

export function RecalcButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => { await refreshCalibration(); router.refresh(); })}>{pending ? "Checking…" : "Recalculate"}</button>;
}

export function Suggestion({ s, isAdmin }: { s: { id: string; activity: string; unit: string; current: number | null; suggested: number; method: string; jobs: { jobName: string; quantity: number; hours: number | null; outputPerDay: number }[] }; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(String(s.suggested));
  const variance = s.current ? ((s.suggested - s.current) / s.current) * 100 : null;
  const act = (a: "APPROVE" | "EDIT" | "DISMISS") => start(async () => { await decideCalibration(s.id, a, a === "EDIT" ? Number(v) : undefined); router.refresh(); });
  return (
    <li className="rounded-xl border border-mist bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{s.activity}</div>
          <div className="text-sm">Setup says <strong>{s.current ?? "—"} {s.unit}/day</strong>; your past jobs averaged <strong>{s.suggested.toLocaleString()} {s.unit}/day</strong>
            {variance != null && <span className={`ml-2 flag ${Math.abs(variance) > 15 ? "flag-warn" : "flag-info"}`}>{variance > 0 ? "+" : ""}{variance.toFixed(0)}%</span>}</div>
          <details className="mt-1 text-xs text-muted"><summary className="cursor-pointer">How was this calculated?</summary>
            <ul className="mt-1 space-y-0.5">{s.jobs.map((j, i) => <li key={i}>{j.jobName}: {j.quantity.toLocaleString()} {s.unit}{j.hours != null ? ` in ${j.hours.toLocaleString()} labor-hours` : ""} → {j.outputPerDay.toFixed(1)} {s.unit}/day</li>)}</ul>
            <p className="mt-1">{s.method === "HOURS" ? "Crew-days = labor hours ÷ (crew size × hours per day). Output = total quantity ÷ total crew-days, so bigger jobs count more." : "No labor hours were available, so the current rate was scaled by estimated ÷ actual cost."}</p>
          </details>
        </div>
        {isAdmin ? (
          <div className="flex flex-wrap items-center gap-2">
            {edit ? <><input aria-label="Output per day" className="cell-input w-24 text-right" value={v} onChange={(e) => setV(e.target.value)} /><button className="btn btn-primary btn-sm" disabled={pending} onClick={() => act("EDIT")}>Save</button></>
              : <><button className="btn btn-primary btn-sm" disabled={pending} onClick={() => act("APPROVE")}>Approve</button><button className="btn btn-secondary btn-sm" onClick={() => setEdit(true)}>Edit</button></>}
            <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => act("DISMISS")}>Dismiss</button>
          </div>
        ) : <span className="text-xs text-muted">An Admin approves changes to production rates.</span>}
      </div>
    </li>
  );
}
