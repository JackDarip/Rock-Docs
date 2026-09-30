"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runEarthwork, addManualEarthwork, deleteEarthwork, earthworkToBidItems, setSurfaceRole } from "@/app/actions/earthwork";

type Surface = { id: string; name: string; role: string; pointCount: number; faceCount: number; units: string; file: string };
type Soil = { id: string; name: string; swellPct: number | null; shrinkPct: number | null };
const n = (v: number | null | undefined, d = 0) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: d }));

export function SurfaceTable({ surfaces }: { surfaces: Surface[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <table className="tbl">
      <thead><tr><th>Surface</th><th>From file</th><th className="text-right">Points</th><th className="text-right">Triangles</th><th>Units</th><th>Use as</th></tr></thead>
      <tbody>{surfaces.map((s) => (
        <tr key={s.id}>
          <td className="font-semibold">{s.name}</td><td className="text-xs text-muted">{s.file}</td>
          <td className="text-right tabular-nums">{n(s.pointCount)}</td><td className="text-right tabular-nums">{n(s.faceCount)}</td><td>{s.units}</td>
          <td><select aria-label={`Role of ${s.name}`} className="cell-input w-auto" defaultValue={s.role} onChange={(e) => start(async () => { await setSurfaceRole(s.id, e.target.value as any); router.refresh(); })}>
            <option value="EXISTING">Existing ground</option><option value="PROPOSED">Proposed / finish grade</option>
          </select></td>
        </tr>))}
      </tbody>
    </table>
  );
}

export function EarthworkForm({ projectId, surfaces, soils }: { projectId: string; surfaces: Surface[]; soils: Soil[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const ex = surfaces.filter((s) => s.role === "EXISTING"), pr = surfaces.filter((s) => s.role === "PROPOSED");
  const [e, setE] = useState(ex[0]?.id ?? surfaces[0]?.id ?? "");
  const [p, setP] = useState(pr[0]?.id ?? surfaces[1]?.id ?? "");
  const [grid, setGrid] = useState("");
  const [soil, setSoil] = useState(soils[0]?.id ?? "");
  const [err, setErr] = useState("");
  return (
    <form className="grid gap-3 md:grid-cols-5 md:items-end" onSubmit={(ev) => { ev.preventDefault(); setErr(""); start(async () => { const r = await runEarthwork(projectId, e, p, grid ? Number(grid) : null, soil || null); if (!r.ok) setErr(r.error); router.refresh(); }); }}>
      <div><label className="label" htmlFor="ew-e">Existing surface</label><select id="ew-e" className="input" value={e} onChange={(x) => setE(x.target.value)}>{surfaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div><label className="label" htmlFor="ew-p">Proposed surface</label><select id="ew-p" className="input" value={p} onChange={(x) => setP(x.target.value)}>{surfaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div><label className="label" htmlFor="ew-g">Grid spacing (ft)</label><input id="ew-g" className="input" inputMode="decimal" placeholder="Auto" value={grid} onChange={(x) => setGrid(x.target.value)} /></div>
      <div><label className="label" htmlFor="ew-s">Soil type (swell/shrink)</label><select id="ew-s" className="input" value={soil} onChange={(x) => setSoil(x.target.value)}><option value="">None</option>{soils.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.swellPct ?? 0}% / {s.shrinkPct ?? 0}%)</option>)}</select></div>
      <button className="btn btn-primary" disabled={pending || !e || !p}>{pending ? "Calculating…" : "Calculate cut & fill"}</button>
      {err && <p className="text-sm text-warn md:col-span-5">⚠ {err}</p>}
    </form>
  );
}

export function ManualEarthwork({ projectId, soils }: { projectId: string; soils: Soil[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState({ cut: "", fill: "", soil: soils[0]?.id ?? "", note: "" });
  const [err, setErr] = useState("");
  return (
    <form className="grid gap-3 md:grid-cols-[9rem_10rem_12rem_1fr_auto] md:items-end" onSubmit={(ev) => { ev.preventDefault(); setErr(""); start(async () => { const r = await addManualEarthwork(projectId, { cutCy: Number(v.cut || 0), fillCy: Number(v.fill || 0), soilTypeId: v.soil || null, note: v.note }); if (!r.ok) setErr(r.error); else { setV({ ...v, cut: "", fill: "", note: "" }); router.refresh(); } }); }}>
      <div><label className="label" htmlFor="m-cut">Cut (bank CY)</label><input id="m-cut" className="input" inputMode="decimal" value={v.cut} onChange={(x) => setV({ ...v, cut: x.target.value })} /></div>
      <div><label className="label" htmlFor="m-fill">Fill (compacted CY)</label><input id="m-fill" className="input" inputMode="decimal" value={v.fill} onChange={(x) => setV({ ...v, fill: x.target.value })} /></div>
      <div><label className="label" htmlFor="m-soil">Soil type</label><select id="m-soil" className="input" value={v.soil} onChange={(x) => setV({ ...v, soil: x.target.value })}><option value="">None</option>{soils.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div><label className="label" htmlFor="m-note">Where these numbers came from *</label><input id="m-note" className="input" placeholder="e.g. Agtek takeoff by J. Smith, 9/12" value={v.note} onChange={(x) => setV({ ...v, note: x.target.value })} /></div>
      <button className="btn btn-secondary" disabled={pending}>Add</button>
      {err && <p className="text-sm text-warn md:col-span-5">⚠ {err}</p>}
    </form>
  );
}

export function CutFillMap({ preview }: { preview: { w: number; h: number; max: number; cells: (number | null)[] } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d")!; const img = ctx.createImageData(preview.w, preview.h);
    const max = preview.max || 1;
    preview.cells.forEach((v, i) => {
      const o = i * 4;
      if (v == null) { img.data[o + 3] = 0; return; }
      const t = Math.min(1, Math.abs(v) / max);
      // cut = orange-red, fill = blue, near zero = pale
      const [r, g, b] = v < 0 ? [255, Math.round(237 - 130 * t), Math.round(213 - 213 * t)] : [Math.round(219 - 190 * t), Math.round(234 - 140 * t), 254];
      img.data.set([r, g, b, 255], o);
    });
    c.width = preview.w; c.height = preview.h; ctx.putImageData(img, 0, 0);
  }, [preview]);
  return (
    <figure>
      <canvas ref={ref} className="w-full max-w-sm rounded border border-line [image-rendering:pixelated]" style={{ aspectRatio: `${preview.w}/${preview.h}` }} aria-label="Cut and fill map" />
      <figcaption className="mt-1 flex items-center gap-3 text-xs text-muted"><span className="inline-block h-2 w-4 rounded bg-[#ff6b00]" />Cut <span className="inline-block h-2 w-4 rounded bg-[#1d5efe]" />Fill · deepest {preview.max.toFixed(1)} ft · north is up</figcaption>
    </figure>
  );
}

export function CalcActions({ id, hasExport, hasImport }: { id: string; hasExport: boolean; hasImport: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const add = (w: ("cut" | "fill" | "export" | "import")[]) => start(async () => { const r = await earthworkToBidItems(id, w); setMsg(r.ok ? `Added ${r.added} draft bid item${r.added === 1 ? "" : "s"}. Confirm them on the Review page.` : `⚠ ${r.error}`); router.refresh(); });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => add(["cut", "fill", ...(hasExport ? ["export" as const] : []), ...(hasImport ? ["import" as const] : [])])}>Add as bid items</button>
      <button className="text-xs text-faint hover:text-danger" onClick={() => { if (confirm("Delete this calculation?")) start(async () => { await deleteEarthwork(id); router.refresh(); }); }}>Delete</button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}
