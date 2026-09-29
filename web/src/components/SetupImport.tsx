"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadSetupDoc, applySetupImport, discardSetupImport } from "@/app/actions/imports";
import { FilePicker } from "./FilePicker";

type Draft = { id: string; filename: string; status: string; statusDetail: string | null; meta: any; rows: any[] };
const money = (v: number | null | undefined) => (v == null ? "—" : `$${v.toFixed(2)}`);

export function SetupImport({ kind, drafts, roles, readOnly, aiOn }: { kind: "WAGES" | "EQUIPMENT"; drafts: Draft[]; roles: { id: string; name: string }[]; readOnly: boolean; aiOn: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-3" action={(fd) => start(async () => { const r = await uploadSetupDoc(kind, fd); setMsg(r.ok ? "Reading it now. The results show up here for you to check." : `⚠ ${r.error}`); router.refresh(); })}>
        <div>
          <div className="label">{kind === "WAGES" ? "Wage determination (PDF)" : "Equipment cost report (PDF, Excel or CSV)"}</div>
          <FilePicker name="file" accept={kind === "WAGES" ? ".pdf" : ".pdf,.xlsx,.csv"} disabled={readOnly || !aiOn} label="Choose file" />
        </div>
        <button className="btn btn-secondary" disabled={readOnly || !aiOn || pending}>{pending ? "Uploading…" : "Read with AI"}</button>
        {!aiOn && <span className="text-xs text-muted">AI reading isn&apos;t switched on for this server; type the values in the table.</span>}
      </form>
      {msg && <p className={`text-sm ${msg.startsWith("⚠") ? "text-warn" : "text-muted"}`}>{msg}</p>}
      {drafts.map((d) => <DraftReview key={`${d.id}-${d.status}-${d.rows.length}`} d={d} kind={kind} roles={roles} readOnly={readOnly} />)}
    </div>
  );
}

function DraftReview({ d, kind, roles, readOnly }: { d: Draft; kind: "WAGES" | "EQUIPMENT"; roles: { id: string; name: string }[]; readOnly: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const guess = (cls: string) => roles.find((r) => cls.toLowerCase().includes(r.name.toLowerCase().split(/\s+/)[0]))?.id ?? "";
  const [pick, setPick] = useState<Record<number, { on: boolean; role: string }>>(() => Object.fromEntries(d.rows.map((r, i) => [i, { on: r.confidence !== "low", role: kind === "WAGES" ? guess(r.classification ?? "") : "" }])));
  const [roleUpdate, setRoleUpdate] = useState(false);
  if (d.status === "PROCESSING") return <p className="rounded-lg border border-mist bg-white p-3 text-sm text-muted">Reading {d.filename}…</p>;
  if (d.status === "FAILED") return <p className="rounded-lg border border-warn-line bg-warn-bg p-3 text-sm text-warn">⚠ Couldn&apos;t read {d.filename}: {d.statusDetail}</p>;
  const n = Object.values(pick).filter((p) => p.on).length;
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50/50 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm"><strong>{d.filename}</strong> · AI-read, check each row{d.meta?.number ? ` · WD ${d.meta.number}` : ""}{d.meta?.effective ? ` · effective ${d.meta.effective}` : ""}{d.meta?.counties?.length ? ` · ${d.meta.counties.join(", ")}` : ""}</div>
        {kind === "WAGES" && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={roleUpdate} onChange={(e) => setRoleUpdate(e.target.checked)} />Also set the prevailing wage on the matched crew role</label>}
      </div>
      <div className="overflow-x-auto">
        <table className="tbl bg-white">
          <thead>{kind === "WAGES"
            ? <tr><th /><th>Classification</th><th>County</th><th className="text-right">Base /hr</th><th className="text-right">Fringe /hr</th><th>Your crew role</th><th>Page</th></tr>
            : <tr><th /><th>Machine</th><th>Type</th><th className="text-right">Ownership /hr</th><th className="text-right">Operating /hr</th><th className="text-right">Standby /hr</th><th className="text-right">Move cost</th><th>Page</th></tr>}</thead>
          <tbody>{d.rows.map((r, i) => (
            <tr key={i} className={r.confidence === "low" ? "row-warn" : ""}>
              <td><input type="checkbox" aria-label="Include this row" checked={pick[i]?.on ?? false} onChange={(e) => setPick({ ...pick, [i]: { ...pick[i], on: e.target.checked } })} /></td>
              {kind === "WAGES" ? <>
                <td>{r.classification}{r.confidence === "low" && <span className="ml-1 flag flag-warn">unsure</span>}</td><td>{r.county ?? "—"}</td>
                <td className="text-right tabular-nums">{money(r.base_rate)}</td><td className="text-right tabular-nums">{money(r.fringe)}</td>
                <td><select aria-label="Crew role" className="cell-input w-40" value={pick[i]?.role ?? ""} onChange={(e) => setPick({ ...pick, [i]: { ...pick[i], role: e.target.value } })}><option value="">—</option>{roles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
              </> : <>
                <td>{r.name}{r.confidence === "low" && <span className="ml-1 flag flag-warn">unsure</span>}</td><td>{r.type ?? "—"}</td>
                <td className="text-right tabular-nums">{money(r.ownership_hourly)}</td><td className="text-right tabular-nums">{money(r.operating_hourly)}</td>
                <td className="text-right tabular-nums">{money(r.standby_hourly)}</td><td className="text-right tabular-nums">{money(r.mobilization_cost)}</td>
              </>}
              <td className="text-xs text-muted">{r.page}</td>
            </tr>))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex gap-2">
        <button className="btn btn-primary btn-sm" disabled={readOnly || pending || !n} onClick={() => start(async () => { await applySetupImport(d.id, Object.entries(pick).filter(([, p]) => p.on).map(([i, p]) => ({ index: Number(i), laborRoleId: p.role || null })), roleUpdate); router.refresh(); })}>Add {n} row{n === 1 ? "" : "s"}</button>
        <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => { await discardSetupImport(d.id); router.refresh(); })}>Discard</button>
      </div>
    </div>
  );
}
