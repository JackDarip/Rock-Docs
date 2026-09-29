"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMapping, removeMapping, updateMapping, suggestMappings, setOverride, saveEstimateVersion } from "@/app/actions/project";

export function AddMapping({ projectId, bidItemId, assemblies }: { projectId: string; bidItemId: string; assemblies: { id: string; name: string; unit: string }[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  if (!assemblies.length) return <span className="text-xs text-muted">Build assemblies in Company Setup first.</span>;
  return (
    <select className="input w-72 text-sm" value="" onChange={(e) => { const v = e.target.value; if (v) start(async () => { await addMapping(projectId, bidItemId, v); router.refresh(); }); }}>
      <option value="">+ Map to an assembly…</option>
      {assemblies.map((a) => <option key={a.id} value={a.id}>{a.name} (per {a.unit})</option>)}
    </select>
  );
}

export function MappingControls({ projectId, mappingId, qtyFactor, confirmed, aiSuggested }: { projectId: string; mappingId: string; qtyFactor: number; confirmed: boolean; aiSuggested: boolean }) {
  const router = useRouter();
  const [f, setF] = useState(qtyFactor);
  const [, start] = useTransition();
  return (
    <span className="flex items-center gap-2 text-xs">
      {!confirmed && <><span className="flag flag-warn">{aiSuggested ? "Suggested" : "Unconfirmed"}</span><button className="btn btn-primary btn-sm" onClick={() => start(async () => { await updateMapping(projectId, mappingId, { confirmed: true }); router.refresh(); })}>Confirm</button></>}
      <label title="Multiply the bid item quantity (e.g. 1.0 = same quantity; 0.5 = half of it uses this assembly)">× <input className="cell-input w-16 text-right" type="number" step="any" value={f} onChange={(e) => setF(Number(e.target.value))} onBlur={() => f !== qtyFactor && start(async () => { await updateMapping(projectId, mappingId, { qtyFactor: f || 1 }); router.refresh(); })} /></label>
      <button className="text-faint hover:text-danger" title="Remove mapping" onClick={() => start(async () => { await removeMapping(projectId, mappingId); router.refresh(); })}>✕</button>
    </span>
  );
}

export function SuggestButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  return (
    <span className="flex items-center gap-2">
      <button className="btn btn-secondary btn-sm" onClick={async () => { const n = await suggestMappings(projectId); setMsg(n ? `${n} suggestion${n > 1 ? "s" : ""} added; confirm each one.` : "No confident matches. Map them by hand."); router.refresh(); }}>Suggest mappings for unmapped items</button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </span>
  );
}

type Target = { type: string; id: string; name: string; fields: { key: string; label: string; current: number | null }[] };

export function OverridePanel({ projectId, targets, overrides }: { projectId: string; targets: Target[]; overrides: { targetType: string; targetId: string; field: string; value: number; reason: string | null }[] }) {
  const router = useRouter();
  const [t, setT] = useState(0);
  const [field, setField] = useState(0);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [, start] = useTransition();
  const target = targets[t];
  const fld = target?.fields[field];
  const label = (o: (typeof overrides)[number]) => {
    const tg = targets.find((x) => x.type === o.targetType && x.id === o.targetId);
    return `${tg?.name ?? "?"}: ${tg?.fields.find((f) => f.key === o.field)?.label ?? o.field}`;
  };
  return (
    <div className="space-y-3 text-sm">
      {overrides.length === 0 ? <p className="text-muted">No job-level overrides. Company defaults are used everywhere.</p> : (
        <ul className="space-y-1">{overrides.map((o, i) => {
          const tg = targets.find((x) => x.type === o.targetType && x.id === o.targetId);
          const def = tg?.fields.find((f) => f.key === o.field)?.current;
          return (
            <li key={i} className="flex items-start justify-between gap-2 rounded-lg bg-brand-50 p-2">
              <span><strong>{label(o)}</strong> = {o.value} <span className="text-muted">(company: {def ?? "—"})</span>{o.reason && <div className="text-xs text-muted">Reason: {o.reason}</div>}</span>
              <button className="text-xs text-faint hover:text-danger" onClick={() => start(async () => { await setOverride(projectId, o.targetType, o.targetId, o.field, null, null); router.refresh(); })}>Remove</button>
            </li>
          );
        })}</ul>
      )}
      {targets.length > 0 && (
        <div className="space-y-2 rounded-lg border border-line p-3">
          <div className="font-semibold">Override a value for this job only</div>
          <select className="input" value={t} onChange={(e) => { setT(Number(e.target.value)); setField(0); }}>{targets.map((x, i) => <option key={i} value={i}>{x.name}</option>)}</select>
          <select className="input" value={field} onChange={(e) => setField(Number(e.target.value))}>{target?.fields.map((f, i) => <option key={f.key} value={i}>{f.label} (company: {f.current ?? "—"})</option>)}</select>
          <input className="input" type="number" step="any" placeholder="New value for this job" value={value} onChange={(e) => setValue(e.target.value)} />
          <input className="input" placeholder="Reason (optional, logged)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn btn-primary btn-sm" disabled={value === "" || !fld} onClick={() => start(async () => { await setOverride(projectId, target.type, target.id, fld!.key, Number(value), reason || null); setValue(""); setReason(""); router.refresh(); })}>Apply override</button>
        </div>
      )}
    </div>
  );
}

export function SaveVersion({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  return (
    <div className="flex gap-2">
      <input className="input" placeholder="Version note (e.g. before addendum 2)" value={label} onChange={(e) => setLabel(e.target.value)} />
      <button className="btn btn-secondary btn-sm" onClick={async () => { await saveEstimateVersion(projectId, label || null); setLabel(""); router.refresh(); }}>Save version</button>
    </div>
  );
}
