"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { updateSheet } from "@/app/actions/project";

export const SHEET_CLASSES: [string, string][] = [
  ["cover", "Cover / index"], ["general_notes", "General notes"], ["quantity_summary", "Quantity summary"], ["grading", "Grading"],
  ["utility_plan_profile", "Utility plan & profile"], ["paving", "Paving"], ["structures", "Structures"], ["details", "Details"],
  ["traffic_control", "Traffic control"], ["erosion_control", "Erosion control"], ["cross_sections", "Cross sections"], ["other", "Other"],
];

type Sheet = { id: string; documentId: string; pageIndex: number; sheetNumber: string | null; title: string | null; discipline: string | null; classification: string | null; classConfirmed: boolean; hasText: boolean; feetPerUnit: number | null; scaleText: string | null };

export function SheetIndex({ projectId, sheets, docs }: { projectId: string; sheets: Sheet[]; docs: { id: string; filename: string }[] }) {
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("");
  const [rows, setRows] = useState(sheets);
  const filtered = useMemo(() => rows.filter((s) =>
    (!cls || s.classification === cls) &&
    (!q || `${s.sheetNumber ?? ""} ${s.title ?? ""} ${s.pageIndex + 1}`.toLowerCase().includes(q.toLowerCase()))), [rows, q, cls]);
  const patch = (id: string, p: Partial<Sheet>) => { setRows((r) => r.map((s) => (s.id === id ? { ...s, ...p } : s))); updateSheet(id, p as any); };
  const docName = (id: string) => docs.find((d) => d.id === id)?.filename ?? "";
  const scanned = rows.filter((s) => !s.hasText).length;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input w-64" placeholder="Search sheet number or title" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-56" value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="">All sheet types</option>{SHEET_CLASSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className="text-sm text-muted">{filtered.length} of {rows.length} sheets{scanned ? ` · ${scanned} scanned (no embedded text)` : ""}</span>
      </div>
      <div className="max-h-[520px] overflow-auto rounded-xl border border-line">
        <table className="tbl">
          <thead><tr><th>Page</th><th>Sheet #</th><th>Title</th><th>Type</th><th>Discipline</th><th>Scale</th><th /></tr></thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td className="text-xs text-muted">{docs.length > 1 && <div className="max-w-32 truncate">{docName(s.documentId)}</div>}p. {s.pageIndex + 1}</td>
                <td><input className="cell-input w-20 font-mono" defaultValue={s.sheetNumber ?? ""} onBlur={(e) => patch(s.id, { sheetNumber: e.target.value || null })} /></td>
                <td><input className="cell-input" defaultValue={s.title ?? ""} onBlur={(e) => patch(s.id, { title: e.target.value || null })} /></td>
                <td>
                  <select className="cell-input" value={s.classification ?? ""} onChange={(e) => patch(s.id, { classification: e.target.value || null, classConfirmed: true })}>
                    <option value="">—</option>{SHEET_CLASSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  {!s.classConfirmed && s.classification && <span className="flag flag-muted ml-1" title="Suggested from sheet text">suggested</span>}
                </td>
                <td className="text-xs">{s.discipline ?? "—"}</td>
                <td className="text-xs">{s.feetPerUnit ? <span className="flag flag-ok">calibrated</span> : s.scaleText ?? "—"}</td>
                <td><Link className="text-sm font-semibold text-navy-700 hover:underline" href={`/projects/${projectId}/viewer?doc=${s.documentId}&page=${s.pageIndex + 1}`}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
