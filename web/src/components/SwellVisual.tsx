"use client";
import { useState } from "react";

export function SwellVisual({ soils }: { soils: { name: string; swellPct: number | null; shrinkPct: number | null }[] }) {
  const [i, setI] = useState(0);
  const s = soils[i];
  if (!s) return <p className="text-sm text-muted">Add a soil type to see the before/after volumes.</p>;
  const bank = 100, loose = bank * (1 + (s.swellPct ?? 0) / 100), comp = bank * (1 - (s.shrinkPct ?? 0) / 100);
  const max = Math.max(bank, loose, comp);
  const bar = (label: string, v: number, color: string) => (
    <div className="flex items-end gap-2">
      <div className="w-24 text-xs text-muted">{label}</div>
      <div className="h-6 rounded" style={{ width: `${(v / max) * 100}%`, background: color }} />
      <div className="w-16 text-right text-sm font-semibold">{v.toFixed(0)} CY</div>
    </div>
  );
  return (
    <div className="space-y-3">
      <select className="input" value={i} onChange={(e) => setI(Number(e.target.value))}>
        {soils.map((x, j) => <option key={j} value={j}>{x.name}</option>)}
      </select>
      {bar("In the ground", bank, "#234478")}
      {bar("In the truck", loose, "#FF6B00")}
      {bar("Compacted", comp, "#047857")}
      <p className="text-xs text-muted">So a 12 CY truck carries about {(12 / (loose / bank)).toFixed(1)} bank CY of {s.name.toLowerCase()}.</p>
    </div>
  );
}
