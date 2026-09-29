"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAssembly, duplicateAssembly, deleteSetupRecord } from "@/app/actions/setup";
import { PRODUCT_NAME } from "@/config/brand";
import {
  assemblyUnitCost, buildContext,
  type AssemblyT, type EquipmentT, type LaborRoleT, type MaterialT, type ProductionRateT,
} from "@/lib/calc";

type Asm = AssemblyT & { description: string | null };
type Setup = { laborRoles: LaborRoleT[]; equipment: EquipmentT[]; materials: MaterialT[]; productionRates: ProductionRateT[] };

export function AssemblyEditor({ assemblies, setup, readOnly }: { assemblies: Asm[]; setup: Setup; readOnly: boolean }) {
  const [editing, setEditing] = useState<Asm | null>(null);
  const router = useRouter();
  const ctx = useMemo(() => buildContext({ ...setup, materials: setup.materials.map((m) => ({ ...m, lastQuotedAt: m.lastQuotedAt ? new Date(m.lastQuotedAt) : null })) }), [setup]);
  const [, start] = useTransition();
  const blank: Asm = { id: "", name: "", unit: "LF", description: null, productionRateId: null, materials: [] };

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-3 lg:col-span-2">
        {!readOnly && <button className="btn btn-primary" onClick={() => setEditing({ ...blank })}>+ New assembly</button>}
        {assemblies.length === 0 && <p className="rounded-xl border border-dashed border-mist bg-white p-6 text-sm text-muted">No assemblies yet. Example: &quot;8-inch PVC sewer, 8 ft deep&quot; per LF = 1.05 LF pipe + 0.35 CY bedding + 1.2 CY backfill, installed by your pipe crew.</p>}
        {assemblies.map((a) => {
          const uc = assemblyUnitCost(ctx, a);
          return (
            <div key={a.id} className={`card p-4 ${editing?.id === a.id ? "border-brand" : ""}`}>
              <button className="block w-full text-left" onClick={() => setEditing(a)}>
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{a.name}</div>
                  {uc.issues.length > 0 && <span className="flag flag-warn" title={uc.issues.join("\n")}>⚠ {uc.issues.length}</span>}
                </div>
                <div className="text-sm font-semibold text-navy-700">${uc.total.toFixed(2)} per {a.unit}</div>
                <div className="text-xs text-muted">Labor ${uc.labor.toFixed(2)} · Equip ${uc.equipment.toFixed(2)} · Mat&apos;l ${uc.material.toFixed(2)}</div>
              </button>
              {!readOnly && (
                <div className="mt-2 flex gap-3 text-xs">
                  <button className="text-navy-700 hover:underline" onClick={() => start(async () => { await duplicateAssembly(a.id); router.refresh(); })}>Duplicate</button>
                  <button className="text-faint hover:text-danger" onClick={() => { if (confirm(`Delete "${a.name}"?`)) start(async () => { await deleteSetupRecord("assembly", a.id); router.refresh(); }); }}>Delete</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="lg:col-span-3">
        {editing ? <AsmForm key={editing.id || "new"} asm={editing} setup={setup} ctx={ctx} readOnly={readOnly} onDone={() => { setEditing(null); router.refresh(); }} />
          : <div className="rounded-2xl border border-dashed border-mist bg-white p-10 text-center text-muted">Pick an assembly to edit, or build a new one.</div>}
      </div>
    </div>
  );
}

function AsmForm({ asm, setup, ctx, readOnly, onDone }: { asm: Asm; setup: Setup; ctx: ReturnType<typeof buildContext>; readOnly: boolean; onDone: () => void }) {
  const [a, setA] = useState<Asm>(asm);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const uc = assemblyUnitCost(ctx, a);
  const matById = new Map(setup.materials.map((m) => [m.id, m]));
  const save = () => start(async () => {
    const r = await saveAssembly(a.id || null, { name: a.name, unit: a.unit, description: a.description, productionRateId: a.productionRateId, materials: a.materials });
    if (r.ok) onDone(); else setErr(r.error);
  });
  return (
    <div className="card space-y-5 p-6">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="md:col-span-3">
          <label className="label">Assembly name</label>
          <input className="input" disabled={readOnly} value={a.name} placeholder='e.g. 8" PVC sewer, 8 ft deep' onChange={(e) => setA({ ...a, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Priced per</label>
          <select className="input" disabled={readOnly} value={a.unit} onChange={(e) => setA({ ...a, unit: e.target.value })}>
            {["LF", "CY", "SY", "SF", "TON", "EA", "LS", "AC"].map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Crew & production rate</label>
        <select className="input" disabled={readOnly} value={a.productionRateId ?? ""} onChange={(e) => setA({ ...a, productionRateId: e.target.value || null })}>
          <option value="">— none (materials only) —</option>
          {setup.productionRates.map((p) => <option key={p.id} value={p.id}>{p.activity} ({p.outputPerDay ?? "?"} {p.unit}/day)</option>)}
        </select>
      </div>
      <div>
        <div className="label">Materials for one {a.unit}</div>
        <table className="tbl">
          <thead><tr><th>Material</th><th style={{ width: 110 }}>Qty per {a.unit}</th><th style={{ width: 90 }}>Qty unit</th><th>Note</th><th /></tr></thead>
          <tbody>
            {a.materials.map((m, i) => {
              const mat = matById.get(m.materialId);
              const upd = (patch: Partial<typeof m>) => setA({ ...a, materials: a.materials.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
              return (
                <tr key={i}>
                  <td>
                    <select className="cell-input" disabled={readOnly} value={m.materialId} onChange={(e) => upd({ materialId: e.target.value, unit: null })}>
                      {setup.materials.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.unit})</option>)}
                    </select>
                  </td>
                  <td><input type="number" step="any" className="cell-input text-right" disabled={readOnly} value={m.qtyPerUnit} onChange={(e) => upd({ qtyPerUnit: Number(e.target.value) })} /></td>
                  <td>
                    <select className="cell-input" disabled={readOnly} value={m.unit ?? mat?.unit ?? ""} onChange={(e) => upd({ unit: e.target.value === mat?.unit ? null : e.target.value })}>
                      {[mat?.unit, "CY", "TON", "SY", "SF", "LF", "EA"].filter((v, k, arr) => v && arr.indexOf(v) === k).map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td><input className="cell-input" disabled={readOnly} value={m.note ?? ""} onChange={(e) => upd({ note: e.target.value || null })} /></td>
                  <td>{!readOnly && <button className="text-faint hover:text-danger" onClick={() => setA({ ...a, materials: a.materials.filter((_, j) => j !== i) })}>✕</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!readOnly && (setup.materials.length ? (
          <button className="btn btn-secondary btn-sm mt-2" onClick={() => setA({ ...a, materials: [...a.materials, { materialId: setup.materials[0].id, qtyPerUnit: 1 }] })}>+ Add material</button>
        ) : <p className="mt-2 text-xs text-muted">Add materials in Setup step 4 first.</p>)}
        <p className="mt-2 text-xs text-muted">If you enter a CY quantity for a material you buy by the ton, {PRODUCT_NAME} converts it using that material&apos;s density.</p>
      </div>

      <div className="rounded-xl bg-night p-5 text-white">
        <div className="text-xs uppercase tracking-wider text-mist/70">Live cost per {a.unit}</div>
        <div className="font-display text-4xl font-bold">${uc.total.toFixed(2)}</div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
          <div><div className="text-mist/70">Labor</div>${uc.labor.toFixed(2)}</div>
          <div><div className="text-mist/70">Equipment</div>${uc.equipment.toFixed(2)}</div>
          <div><div className="text-mist/70">Materials</div>${uc.material.toFixed(2)}</div>
        </div>
        <details className="mt-3 text-sm text-mist">
          <summary className="cursor-pointer text-brand-hi">How was this calculated?</summary>
          <ul className="mt-2 space-y-1">{uc.explain.map((e, i) => <li key={i} className="whitespace-pre-wrap">{e}</li>)}</ul>
        </details>
        {uc.issues.length > 0 && <ul className="mt-3 space-y-0.5 text-sm text-amber-300">{uc.issues.map((x, i) => <li key={i}>⚠ {x}</li>)}</ul>}
      </div>

      <div>
        <label className="label">Description (optional)</label>
        <textarea className="input" rows={2} disabled={readOnly} value={a.description ?? ""} onChange={(e) => setA({ ...a, description: e.target.value || null })} />
      </div>
      {err && <p className="text-sm text-warn">⚠ {err}</p>}
      {!readOnly && (
        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save assembly"}</button>
          <button className="btn btn-secondary" onClick={onDone}>Cancel</button>
        </div>
      )}
    </div>
  );
}
