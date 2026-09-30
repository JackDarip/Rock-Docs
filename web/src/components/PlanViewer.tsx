"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calibrateSheet, deleteMarkup, saveMarkup } from "@/app/actions/project";
import { runMeasureSuggestions, pageSuggestions, decideSuggestion } from "@/app/actions/measure";
import { GLOSSARY } from "@/config/glossary";
import { Icon } from "./Icon";

type Pt = [number, number];
type Markup = { id: string; documentId: string; pageIndex: number; bidItemId: string | null; tool: string; points: Pt[]; quantity: number; unit: string; color: string; label: string | null; source?: string };
type Suggestion = { id: string; pageIndex: number; kind: string; label: string; quantity: number; unit: string; points: Pt[]; evidence: string | null; confidence: string };
type Sheet = { pageIndex: number; sheetNumber: string | null; title: string | null; feetPerUnit: number | null; scaleText: string | null };
type BidItem = { id: string; itemNumber: string; description: string; unit: string };
type Tool = "pan" | "calibrate" | "LINEAR" | "POLYLINE" | "AREA" | "COUNT";

const PALETTE = ["#FF6B00", "#2563EB", "#059669", "#9333EA", "#DB2777", "#0891B2", "#CA8A04", "#DC2626", "#4F46E5", "#65A30D"];

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const polyLen = (p: Pt[]) => p.slice(1).reduce((s, q, i) => s + dist(p[i], q), 0);
const polyArea = (p: Pt[]) => Math.abs(p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2;

/** Parse a stated scale like 1" = 50' into feet per PDF unit (72 units per printed inch). */
function statedFeetPerUnit(scaleText: string | null) {
  const m = scaleText && /1"\s*=\s*(\d+(?:\.\d+)?)'?/.exec(scaleText);
  return m ? Number(m[1]) / 72 : null;
}

export function PlanViewer({ projectId, doc, sheets: initialSheets, bidItems, markups: initialMarkups, initialPage, focusMarkupId, aiOn = false }: {
  projectId: string; doc: { id: string; filename: string; pageCount: number | null };
  sheets: Sheet[]; bidItems: BidItem[]; markups: Markup[]; initialPage: number; focusMarkupId?: string | null; aiOn?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<any>(null);
  const [pdfReady, setPdfReady] = useState(0);
  const renderTask = useRef<any>(null);
  const [numPages, setNumPages] = useState(doc.pageCount ?? 0);
  const [page, setPage] = useState(initialPage);
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [tool, setTool] = useState<Tool>("pan");
  const [draft, setDraft] = useState<Pt[]>([]);
  const [hover, setHover] = useState<Pt | null>(null);
  const [markups, setMarkups] = useState<Markup[]>(initialMarkups);
  const [sheets, setSheets] = useState<Sheet[]>(initialSheets);
  const [bidItemId, setBidItemId] = useState<string>(bidItems[0]?.id ?? "");
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState<string | null>(focusMarkupId ?? null);
  const [notice, setNotice] = useState("");
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [sgRunning, setSgRunning] = useState(false);
  const [sgEdit, setSgEdit] = useState<Record<string, { qty: string; bidItemId: string }>>({});
  const [sgFocus, setSgFocus] = useState<string | null>(null);

  const sheet = sheets.find((s) => s.pageIndex === page - 1);
  const fpu = sheet?.feetPerUnit ?? null;
  const colorFor = useCallback((id: string | null) => {
    const i = bidItems.findIndex((b) => b.id === id);
    return i < 0 ? "#64748B" : PALETTE[i % PALETTE.length];
  }, [bidItems]);
  const bidItem = bidItems.find((b) => b.id === bidItemId);

  // Load the document once (streams with HTTP range requests).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const d = await pdfjs.getDocument({ url: `/api/files/${doc.id}?inline=1`, rangeChunkSize: 1 << 20, disableAutoFetch: true }).promise;
        if (cancelled) return;
        pdfRef.current = d;
        setNumPages(d.numPages);
        setPdfReady((n) => n + 1);
      } catch (e: any) { setErr(e?.message ?? "Couldn't open this PDF"); }
    })();
    return () => { cancelled = true; pdfRef.current?.destroy?.(); };
  }, [doc.id]);

  // AI suggestions for this sheet (amber until someone accepts, edits or rejects them).
  useEffect(() => {
    let stop = false;
    let tries = 0;
    const load = async () => {
      const r = await pageSuggestions(doc.id, page - 1);
      if (stop) return;
      setSugs(r.suggestions); setSgRunning(r.running);
      if (r.running && tries++ < 80) setTimeout(load, 3000);
    };
    void load();
    return () => { stop = true; };
  }, [doc.id, page, sgRunning]);

  // Render only the current page at the current zoom.
  useEffect(() => {
    const d = pdfRef.current;
    if (!d || !canvasRef.current) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const p = await d.getPage(page);
      if (cancelled) return;
      const base = p.getViewport({ scale: 1 });
      setSize({ w: base.width, h: base.height });
      const dpr = window.devicePixelRatio || 1;
      const vp = p.getViewport({ scale: zoom * dpr });
      const c = canvasRef.current!;
      c.width = vp.width; c.height = vp.height;
      c.style.width = `${base.width * zoom}px`; c.style.height = `${base.height * zoom}px`;
      renderTask.current?.cancel?.();
      renderTask.current = p.render({ canvasContext: c.getContext("2d")!, viewport: vp });
      try { await renderTask.current.promise; } catch { /* cancelled */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [page, zoom, pdfReady]);

  // Jump to a focused markup (from "open at location" links).
  useEffect(() => {
    if (!focus) return;
    const m = markups.find((x) => x.id === focus);
    if (!m) return;
    if (m.pageIndex !== page - 1) { setPage(m.pageIndex + 1); return; }
    if (!size.w || !wrapRef.current) return;
    const [x, y] = m.points[0];
    wrapRef.current.scrollTo({ left: x * zoom - 300, top: y * zoom - 250, behavior: "smooth" });
  }, [focus, markups, page, size, zoom]);

  const toPt = (e: React.MouseEvent<SVGSVGElement>): Pt => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    return [(e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom];
  };

  const measure = (t: string, pts: Pt[]) => {
    if (t === "COUNT") return { quantity: 1, unit: bidItem?.unit ?? "EA" };
    if (!fpu) return null;
    if (t === "AREA") {
      const sf = polyArea(pts) * fpu * fpu;
      return bidItem?.unit?.toUpperCase() === "SY" ? { quantity: sf / 9, unit: "SY" } : { quantity: sf, unit: "SF" };
    }
    return { quantity: polyLen(pts) * fpu, unit: "LF" };
  };

  const commit = async (t: string, pts: Pt[]) => {
    setDraft([]);
    const mres = measure(t, pts);
    if (!mres) { setNotice("Calibrate this sheet first: click Calibrate, then two points a known distance apart."); return; }
    const data = { documentId: doc.id, pageIndex: page - 1, bidItemId: bidItemId || null, tool: t, points: pts, quantity: Math.round(mres.quantity * 100) / 100, unit: mres.unit, color: colorFor(bidItemId || null), label: null };
    try {
      const saved = await saveMarkup(projectId, data);
      setMarkups((ms) => [...ms, saved]);
    } catch (e: any) { setNotice(e.message); }
  };

  const onClick = async (e: React.MouseEvent<SVGSVGElement>) => {
    if (tool === "pan") return;
    const p = toPt(e);
    if (tool === "COUNT") { await commit("COUNT", [p]); return; }
    const next = [...draft, p];
    if (tool === "calibrate" && next.length === 2) {
      setDraft([]);
      const ft = prompt("How many feet apart are those two points? (e.g. 100)");
      const feet = ft ? Number(ft) : NaN;
      if (!(feet > 0)) return;
      const f = feet / dist(next[0], next[1]);
      await calibrateSheet(projectId, doc.id, page - 1, f);
      setSheets((ss) => ss.some((s) => s.pageIndex === page - 1) ? ss.map((s) => (s.pageIndex === page - 1 ? { ...s, feetPerUnit: f } : s)) : [...ss, { pageIndex: page - 1, sheetNumber: null, title: null, feetPerUnit: f, scaleText: null }]);
      const stated = statedFeetPerUnit(sheet?.scaleText ?? null);
      setNotice(stated && Math.abs(f / stated - 1) > 0.05
        ? `⚠ Calibrated. Heads up: this sheet says ${sheet?.scaleText}, but your calibration is ${Math.round((f / stated) * 100)}% of that. The PDF was probably printed at a different size (e.g. half-size sheets). Your calibration will be used.`
        : "Calibrated ✓ Measurements on this sheet now use your two-point scale.");
      setTool("LINEAR");
      return;
    }
    if (tool === "LINEAR" && next.length === 2) { await commit("LINEAR", next); return; }
    setDraft(next);
  };

  const finish = async () => {
    if (tool === "POLYLINE" && draft.length >= 2) await commit("POLYLINE", draft);
    if (tool === "AREA" && draft.length >= 3) await commit("AREA", draft);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDraft([]);
      if (e.key === "Enter") void finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const pageMarkups = markups.filter((m) => m.pageIndex === page - 1 && m.documentId === doc.id);
  const totals = useMemo(() => {
    const t = new Map<string, { qty: number; unit: string; n: number }>();
    for (const m of markups) {
      if (!m.bidItemId) continue;
      const cur = t.get(m.bidItemId) ?? { qty: 0, unit: m.unit, n: 0 };
      t.set(m.bidItemId, { qty: cur.qty + m.quantity, unit: m.unit, n: cur.n + 1 });
    }
    return t;
  }, [markups]);

  const pageList = Array.from({ length: numPages }, (_, i) => ({ i, s: sheets.find((x) => x.pageIndex === i) }))
    .filter(({ i, s }) => !q || `${i + 1} ${s?.sheetNumber ?? ""} ${s?.title ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  const TOOLS: { k: Tool; label: string; icon: string; tip: string }[] = [
    { k: "pan", label: "Pan", icon: "pan", tip: "Scroll and look around" },
    { k: "calibrate", label: "Calibrate", icon: "ruler", tip: GLOSSARY.calibrate },
    { k: "LINEAR", label: "Linear", icon: "line", tip: "Click two points" },
    { k: "POLYLINE", label: "Polyline", icon: "polyline", tip: "Click points, then Enter or double-click to finish" },
    { k: "AREA", label: "Area", icon: "area", tip: "Click the outline, then Enter or double-click to close" },
    { k: "COUNT", label: "Count", icon: "count", tip: "Click each item" },
  ];
  const PANE_H = "h-[calc(100vh-190px)] min-h-[520px]";

  return (
    <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-3 2xl:grid-cols-[200px_minmax(0,1fr)_280px]">
      <aside className={`flex min-h-0 flex-col rounded-xl border border-line bg-white ${PANE_H}`} aria-label="Sheets">
        <div className="border-b border-line p-2"><input className="input" placeholder="Sheet # or title" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <ul className="min-h-0 flex-1 overflow-auto text-sm">
          {pageList.map(({ i, s }) => (
            <li key={i}>
              <button onClick={() => { setPage(i + 1); setDraft([]); }} className={`block w-full px-3 py-1.5 text-left ${page === i + 1 ? "bg-brand-50 font-semibold text-night" : "hover:bg-paper"}`}>
                <span className="font-mono text-xs text-muted">{i + 1}</span> {s?.sheetNumber ?? ""} <span className="text-xs text-muted">{s?.title ?? ""}</span>
                {s?.feetPerUnit ? <span className="ml-1 text-xs text-ok">●</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className={`flex min-h-0 flex-col rounded-xl border border-line bg-white ${PANE_H}`} aria-label="Plan sheet">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-2" role="toolbar" aria-label="Takeoff tools">
          <div className="inline-flex overflow-hidden rounded-lg border border-line">
            {TOOLS.map((t, i) => (
              <button key={t.k} type="button" title={t.tip} aria-pressed={tool === t.k} onClick={() => { setTool(t.k); setDraft([]); }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold transition ${i ? "border-l border-line" : ""} ${tool === t.k ? "bg-brand text-white" : "bg-white text-ink hover:bg-paper"}`}>
                <Icon name={t.icon} size={15} />{t.label}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center overflow-hidden rounded-lg border border-line bg-white">
            <button type="button" className="px-2 py-1.5 hover:bg-paper" title="Zoom out" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))}><Icon name="zoomOut" size={16} /></button>
            <span className="w-12 border-x border-line py-1.5 text-center text-xs font-semibold tabular-nums">{Math.round(zoom * 100)}%</span>
            <button type="button" className="px-2 py-1.5 hover:bg-paper" title="Zoom in" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(8, z * 1.25))}><Icon name="zoomIn" size={16} /></button>
            <button type="button" className="border-l border-line px-2 py-1.5 hover:bg-paper" title="Fit to width" aria-label="Fit to width" onClick={() => wrapRef.current && size.w && setZoom((wrapRef.current.clientWidth - 20) / size.w)}><Icon name="fit" size={16} /></button>
          </div>
        </div>
        {notice && <div className="flex items-start justify-between gap-2 border-b border-warn-line bg-warn-bg px-3 py-1.5 text-sm text-warn"><span>{notice}</span><button type="button" aria-label="Dismiss" onClick={() => setNotice("")}>✕</button></div>}
        <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-auto bg-slate-200"
          onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom((z) => Math.min(8, Math.max(0.25, z * (e.deltaY < 0 ? 1.1 : 0.9)))); } }}>
          {err && <p className="p-6 text-warn">⚠ {err}</p>}
          <div className="relative m-2 inline-block bg-white shadow" style={{ width: size.w * zoom, height: size.h * zoom }}>
            <canvas ref={canvasRef} className="block" />
            {loading && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">Rendering page {page}…</div>}
            <svg className="absolute inset-0" width={size.w * zoom} height={size.h * zoom} viewBox={`0 0 ${size.w} ${size.h}`}
              style={{ cursor: tool === "pan" ? "grab" : "crosshair" }}
              onClick={onClick} onDoubleClick={() => void finish()} onMouseMove={(e) => tool !== "pan" && setHover(toPt(e))} onMouseLeave={() => setHover(null)}>
              {pageMarkups.map((m) => {
                const sw = (focus === m.id ? 5 : 2.5) / zoom;
                if (m.source === "AI_ACCEPTED") return <g key={m.id} onClick={(e) => { e.stopPropagation(); setFocus(m.id); }}>{m.points.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={9 / zoom} fill={m.color} fillOpacity={0.35} stroke={m.color} strokeWidth={sw} />)}<text x={m.points[0][0] + 12 / zoom} y={m.points[0][1] - 6 / zoom} fontSize={11 / zoom} fill={m.color} fontWeight={700} style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 3 / zoom }}>{m.quantity} {m.unit}</text></g>;
                if (m.tool === "COUNT") return <circle key={m.id} cx={m.points[0][0]} cy={m.points[0][1]} r={7 / zoom} fill={m.color} fillOpacity={0.5} stroke={m.color} strokeWidth={sw} onClick={(e) => { e.stopPropagation(); setFocus(m.id); }} />;
                const d = m.points.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ") + (m.tool === "AREA" ? " Z" : "");
                return <path key={m.id} d={d} fill={m.tool === "AREA" ? m.color : "none"} fillOpacity={0.18} stroke={m.color} strokeWidth={sw} onClick={(e) => { e.stopPropagation(); setFocus(m.id); }} />;
              })}
              {sugs.map((sg) => sg.points.map((p, i) => (
                <g key={`${sg.id}-${i}`} onClick={(e) => { e.stopPropagation(); setSgFocus(sg.id); }} style={{ cursor: "pointer" }}>
                  <circle cx={p[0]} cy={p[1]} r={(sgFocus === sg.id ? 16 : 11) / zoom} fill="#F59E0B" fillOpacity={0.18} stroke="#B45309" strokeWidth={2 / zoom} strokeDasharray={`${4 / zoom}`} />
                  {i === 0 && <text x={p[0] + 14 / zoom} y={p[1] - 8 / zoom} fontSize={11 / zoom} fill="#92400E" fontWeight={700} style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 3 / zoom }}>AI · {sg.label} {sg.quantity} {sg.unit}</text>}
                </g>
              )))}
              {draft.length > 0 && (
                <path d={[...draft, ...(hover ? [hover] : [])].map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ") + (tool === "AREA" && draft.length > 1 ? " Z" : "")}
                  fill={tool === "AREA" ? "#FF6B00" : "none"} fillOpacity={0.12} stroke={tool === "calibrate" ? "#0B1B33" : "#FF6B00"} strokeDasharray={`${6 / zoom}`} strokeWidth={2 / zoom} />
              )}
              {draft.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={3 / zoom} fill="#0B1B33" />)}
            </svg>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line p-2 text-sm">
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
          <span className="flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
            <span className="truncate">Page {page} of {numPages || "…"}{sheet?.sheetNumber ? ` · Sheet ${sheet.sheetNumber}` : ""}{sheet?.title ? ` · ${sheet.title}` : ""}</span>
            {fpu ? <span className="flag flag-ok" title={sheet?.scaleText ? `Stated scale ${sheet.scaleText}` : undefined}>Calibrated · 1 in = {(fpu * 72).toFixed(1)} ft</span> : <span className="flag flag-warn">Not calibrated</span>}
          </span>
          <button className="btn btn-secondary btn-sm" disabled={page >= numPages} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      </section>

      <aside className="col-span-2 grid content-start gap-3 md:grid-cols-3 2xl:col-span-1 2xl:flex 2xl:h-[calc(100vh-190px)] 2xl:min-h-[520px] 2xl:flex-col 2xl:overflow-auto" aria-label="Takeoff details">
        <div className="rounded-xl border border-line bg-white p-3">
          <label className="label">Measuring for bid item</label>
          <select className="input" value={bidItemId} onChange={(e) => setBidItemId(e.target.value)}>
            <option value="">— unassigned —</option>
            {bidItems.map((b) => <option key={b.id} value={b.id}>{b.itemNumber} · {b.description.slice(0, 40)} ({b.unit})</option>)}
          </select>
          {bidItem && <div className="mt-2 flex items-center gap-2 text-xs"><span className="inline-block h-3 w-3 rounded-full" style={{ background: colorFor(bidItem.id) }} />Markups for this item use this color</div>}
          {tool !== "pan" && <p className="mt-2 text-xs text-muted">{TOOLS.find((t) => t.k === tool)?.tip}. Esc cancels.</p>}
          {(tool === "POLYLINE" || tool === "AREA") && draft.length > 1 && <button className="btn btn-primary btn-sm mt-2" onClick={() => void finish()}>Finish ({draft.length} points)</button>}
        </div>
        <div className="rounded-xl border border-line bg-white p-3">
          <div className="label">Takeoff totals (all sheets)</div>
          {totals.size === 0 ? <p className="text-xs text-muted">No measurements yet.</p> : (
            <ul className="space-y-1 text-sm">
              {bidItems.filter((b) => totals.has(b.id)).map((b) => {
                const t = totals.get(b.id)!;
                return <li key={b.id} className="flex justify-between gap-2"><span className="truncate"><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorFor(b.id) }} />{b.itemNumber}</span><span className="font-semibold">{t.qty.toLocaleString("en-US", { maximumFractionDigits: 2 })} {t.unit}</span></li>;
              })}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">Apply these to bid items under Bid items &amp; takeoff.</p>
        </div>
        <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-3">
          <div className="label">AI suggestions for this sheet</div>
          {!aiOn ? <p className="text-xs text-muted">AI suggestions aren&apos;t switched on for this server.</p> : (
            <button className="btn btn-secondary btn-sm" disabled={sgRunning} onClick={async () => { const r = await runMeasureSuggestions(projectId, doc.id, page - 1); if (!r.ok) setNotice(r.error); else setSgRunning(true); }}>{sgRunning ? "Reading the sheet…" : sugs.length ? "Suggest again" : "Suggest quantities"}</button>
          )}
          <p className="mt-1 text-xs text-muted">Reads pipe runs, structure counts and paved areas from this sheet&apos;s callouts. Least reliable source: every suggestion stays amber until you accept, edit or reject it.</p>
          <ul className="mt-2 space-y-2">
            {sugs.map((sg) => {
              const ed = sgEdit[sg.id] ?? { qty: String(sg.quantity), bidItemId };
              return (
                <li key={sg.id} className={`rounded-lg border bg-white p-2 text-xs ${sgFocus === sg.id ? "border-amber-500" : "border-amber-200"}`} onMouseEnter={() => setSgFocus(sg.id)}>
                  <div className="flex items-center justify-between gap-2"><strong className="text-sm">{sg.label}</strong>{sg.confidence === "LOW" && <span className="flag flag-warn">low confidence</span>}</div>
                  {sg.evidence && <p className="mt-0.5 text-muted">{sg.evidence}</p>}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input aria-label="Quantity" className="cell-input w-20 text-right" inputMode="decimal" value={ed.qty} onChange={(e) => setSgEdit({ ...sgEdit, [sg.id]: { ...ed, qty: e.target.value } })} /><span>{sg.unit}</span>
                    <select aria-label="Bid item" className="cell-input min-w-0 flex-1" value={ed.bidItemId} onChange={(e) => setSgEdit({ ...sgEdit, [sg.id]: { ...ed, bidItemId: e.target.value } })}>
                      <option value="">— bid item —</option>{bidItems.map((b) => <option key={b.id} value={b.id}>{b.itemNumber} {b.description.slice(0, 28)}</option>)}
                    </select>
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    <button className="btn btn-primary btn-sm" onClick={async () => {
                      const r = await decideSuggestion(projectId, sg.id, true, { quantity: Number(ed.qty) || sg.quantity, bidItemId: ed.bidItemId || null, color: colorFor(ed.bidItemId || null) });
                      if (r.ok && r.markup) setMarkups((ms) => [...ms, r.markup as Markup]);
                      setSugs((x) => x.filter((y) => y.id !== sg.id));
                    }}>Accept</button>
                    <button className="btn btn-secondary btn-sm" onClick={async () => { await decideSuggestion(projectId, sg.id, false); setSugs((x) => x.filter((y) => y.id !== sg.id)); }}>Reject</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="min-h-0 rounded-xl border border-line bg-white p-3">
          <div className="label">Markups on this sheet</div>
          {pageMarkups.length === 0 && <p className="text-xs text-muted">None yet.</p>}
          <ul className="space-y-1 text-sm">
            {pageMarkups.map((m) => (
              <li key={m.id} className={`flex items-center justify-between gap-2 rounded px-1 ${focus === m.id ? "bg-brand-50" : ""}`}>
                <button className="truncate text-left" onClick={() => setFocus(m.id)}>
                  <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
                  {m.source === "AI_ACCEPTED" ? "AI" : m.tool.toLowerCase()} · {m.quantity.toLocaleString("en-US", { maximumFractionDigits: 2 })} {m.unit}
                  <span className="text-xs text-muted"> {bidItems.find((b) => b.id === m.bidItemId)?.itemNumber ?? ""}</span>
                </button>
                <button className="text-faint hover:text-danger" onClick={async () => { await deleteMarkup(projectId, m.id); setMarkups((ms) => ms.filter((x) => x.id !== m.id)); }}>✕</button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
