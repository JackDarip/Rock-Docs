"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveProductionRate, deleteSetupRecord } from "@/app/actions/setup";
import { buildContext, crewCost, unitsPerHour, type CrewT, type EquipmentT, type LaborRoleT, type ProductionRateT } from "@/lib/calc";

type Rate = ProductionRateT & { notes: string | null };

const UNITS = ["CY", "LF", "SY", "SF", "TON", "EA", "LS", "AC"];

export function ProductionEditor({ rates, laborRoles, equipment, readOnly }: { rates: Rate[]; laborRoles: LaborRoleT[]; equipment: EquipmentT[]; readOnly: boolean }) {
  const [editing, setEditing] = useState<Rate | null>(null);
  const router = useRouter();
  const ctx = useMemo(() => buildContext({ laborRoles, equipment, materials: [], productionRates: [] }), [laborRoles, equipment]);
  const blank: Rate = { id: "", activity: "", unit: "CY", outputPerDay: null, hoursPerDay: 8, crew: { labor: [], equipment: [] }, verified: true, notes: null };

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-3 lg:col-span-2">
        {!readOnly && <button className="btn btn-primary" onClick={() => setEditing({ ...blank })}>+ Add production rate</button>}
        {rates.length === 0 && <p className="rounded-xl border border-dashed border-mist bg-white p-6 text-sm text-muted">No production rates yet. Add one for each activity you bid: mass excavation, trench &amp; lay 8&quot; PVC, place &amp; compact base, pave…</p>}
        {rates.map((r) => {
          const c = crewCost(ctx, r), u = unitsPerHour(ctx, r);
          const per = u.perHour > 0 ? (c.laborHr + c.equipHr) / u.perHour : null;
          return (
            <button key={r.id} onClick={() => setEditing(r)} className={`card block w-full p-4 text-left transition hover:border-brand ${editing?.id === r.id ? "border-brand" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="font-semibold">{r.activity}</div>
                {(c.issues.length > 0 || !r.verified) && <span className="flag flag-warn">⚠ Check</span>}
              </div>
              <div className="text-sm text-muted">{r.outputPerDay ?? "?"} {r.unit}/day · {r.crew.labor.reduce((s, x) => s + x.count, 0)} people · {r.crew.equipment.reduce((s, x) => s + x.count, 0)} machines</div>
              <div className="mt-1 text-sm font-semibold text-navy-700">{per != null ? `$${per.toFixed(2)} per ${r.unit} labor + equipment` : "Needs a daily output"}</div>
            </button>
          );
        })}
      </div>
      <div className="lg:col-span-3">
        {editing ? (
          <RateForm key={editing.id || "new"} rate={editing} laborRoles={laborRoles} equipment={equipment} readOnly={readOnly}
            onDone={() => { setEditing(null); router.refresh(); }} />
        ) : (
          <div className="rounded-2xl border border-dashed border-mist bg-white p-10 text-center text-muted">Pick a rate to edit, or add a new one.</div>
        )}
      </div>
    </div>
  );
}

function RateForm({ rate, laborRoles, equipment, readOnly, onDone }: { rate: Rate; laborRoles: LaborRoleT[]; equipment: EquipmentT[]; readOnly: boolean; onDone: () => void }) {
  const [r, setR] = useState<Rate>(rate);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const ctx = useMemo(() => buildContext({ laborRoles, equipment, materials: [], productionRates: [] }), [laborRoles, equipment]);
  const crew = crewCost(ctx, r);
  const uph = unitsPerHour(ctx, r);
  const setCrew = (c: CrewT) => setR({ ...r, crew: c });

  const save = () => start(async () => {
    const res = await saveProductionRate(r.id || null, {
      activity: r.activity, unit: r.unit, outputPerDay: r.outputPerDay, hoursPerDay: r.hoursPerDay, crew: r.crew, notes: r.notes, verified: r.verified,
    });
    if (res.ok) onDone(); else setErr(res.error);
  });

  return (
    <div className="card space-y-5 p-6">
      <div>
        <label className="label">What&apos;s the activity?</label>
        <input className="input" disabled={readOnly} value={r.activity} placeholder="e.g. Place and compact aggregate base" onChange={(e) => setR({ ...r, activity: e.target.value })} />
      </div>
      <div className="rounded-xl bg-paper p-4">
        <div className="text-lg">
          How many
          <select className="input mx-2 inline-block w-24" disabled={readOnly} value={r.unit} onChange={(e) => setR({ ...r, unit: e.target.value })}>
            {UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
          can your crew get done in one
          <input type="number" className="input mx-2 inline-block w-20" disabled={readOnly} value={r.hoursPerDay} onChange={(e) => setR({ ...r, hoursPerDay: Number(e.target.value) || 8 })} />
          -hour day?
        </div>
        <input type="number" className="input mt-3 w-48 text-2xl font-bold" disabled={readOnly} value={r.outputPerDay ?? ""} placeholder="e.g. 600"
          onChange={(e) => setR({ ...r, outputPerDay: e.target.value === "" ? null : Number(e.target.value) })} />
        <span className="ml-2 text-muted">{r.unit} per day</span>
        <p className="mt-2 text-xs text-muted">Use what your crews really do on an average day, including setup, moves and small delays. Not the best day ever.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CrewPicker title="People on the crew" options={laborRoles.map((l) => ({ id: l.id, name: l.name }))} readOnly={readOnly}
          items={r.crew.labor.map((l) => ({ id: l.laborRoleId, count: l.count }))}
          onChange={(xs) => setCrew({ ...r.crew, labor: xs.map((x) => ({ laborRoleId: x.id, count: x.count })) })} />
        <CrewPicker title="Machines on the crew" options={equipment.map((e) => ({ id: e.id, name: e.name }))} readOnly={readOnly}
          items={r.crew.equipment.map((l) => ({ id: l.equipmentId, count: l.count }))}
          onChange={(xs) => setCrew({ ...r.crew, equipment: xs.map((x) => ({ equipmentId: x.id, count: x.count })) })} />
      </div>

      <div className="rounded-xl border border-mist bg-white p-4 text-sm">
        <div className="mb-1 font-semibold">What this means</div>
        {uph.perHour > 0 ? (
          <ul className="space-y-0.5 text-muted">
            <li>{uph.perHour.toFixed(2)} {r.unit} per crew-hour ({(1 / uph.perHour).toFixed(3)} crew-hours per {r.unit})</li>
            <li>Crew costs ${crew.laborHr.toFixed(2)}/hr labor + ${crew.equipHr.toFixed(2)}/hr equipment</li>
            <li className="font-semibold text-night">= ${(crew.laborHr / uph.perHour).toFixed(2)} labor + ${(crew.equipHr / uph.perHour).toFixed(2)} equipment per {r.unit}</li>
          </ul>
        ) : <p className="text-muted">Enter a daily output to see cost per {r.unit}.</p>}
        {crew.issues.length > 0 && <ul className="mt-2 text-warn">{crew.issues.map((i, k) => <li key={k}>⚠ {i}</li>)}</ul>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">Notes</label>
          <input className="input" disabled={readOnly} value={r.notes ?? ""} onChange={(e) => setR({ ...r, notes: e.target.value || null })} placeholder="Conditions this rate assumes" />
        </div>
        <label className="flex items-center gap-2 pt-6 text-sm">
          <input type="checkbox" disabled={readOnly} checked={r.verified} onChange={(e) => setR({ ...r, verified: e.target.checked })} />
          I&apos;ve checked this against real job results
        </label>
      </div>
      {err && <p className="text-sm text-warn">⚠ {err}</p>}
      {!readOnly && (
        <div className="flex justify-between">
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save rate"}</button>
            <button className="btn btn-secondary" onClick={onDone}>Cancel</button>
          </div>
          {r.id && <button className="btn btn-ghost text-danger" onClick={() => { if (confirm("Delete this production rate?")) start(async () => { await deleteSetupRecord("productionRate", r.id); onDone(); }); }}>Delete</button>}
        </div>
      )}
    </div>
  );
}

function CrewPicker({ title, options, items, onChange, readOnly }: {
  title: string; options: { id: string; name: string }[]; items: { id: string; count: number }[];
  onChange: (xs: { id: string; count: number }[]) => void; readOnly: boolean;
}) {
  return (
    <div>
      <div className="label">{title}</div>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex gap-2">
            <input type="number" min={0.25} step={0.25} className="input w-20" disabled={readOnly} value={it.count}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, count: Number(e.target.value) || 1 } : x)))} />
            <select className="input" disabled={readOnly} value={it.id} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))}>
              {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            {!readOnly && <button className="text-faint hover:text-danger" onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>}
          </div>
        ))}
        {!readOnly && (options.length ? (
          <button className="btn btn-secondary btn-sm" onClick={() => onChange([...items, { id: options[0].id, count: 1 }])}>+ Add</button>
        ) : <p className="text-xs text-muted">Add some in setup first.</p>)}
      </div>
    </div>
  );
}
