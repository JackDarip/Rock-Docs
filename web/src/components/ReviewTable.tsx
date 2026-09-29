"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRow } from "@/app/actions/crud";
import { confirmBidItems, unconfirmBidItem } from "@/app/actions/project";

type Item = { id: string; itemNumber: string; description: string; unit: string; quantity: number | null; source: string; confidence: string; aiExtracted: boolean; status: string; documentId: string | null; pageIndex: number | null; sourceNote: string | null; specSection: string | null };

export function ReviewTable({ projectId, items, docs }: { projectId: string; items: Item[]; docs: Record<string, string> }) {
  const [rows, setRows] = useState(items);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [, start] = useTransition();
  const router = useRouter();
  const drafts = rows.filter((r) => r.status === "DRAFT");
  const edit = (id: string, key: keyof Item, value: any) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
    start(async () => { await saveRow("bidItem", id, { [key]: value }); });
  };
  const confirm = (ids: string[]) => start(async () => {
    await confirmBidItems(projectId, ids);
    setRows((rs) => rs.map((r) => (ids.includes(r.id) ? { ...r, status: "CONFIRMED" } : r)));
    setSel(new Set());
    router.refresh();
  });
  const high = drafts.filter((r) => r.confidence === "HIGH" && r.quantity != null).map((r) => r.id);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className="btn btn-primary btn-sm" disabled={!sel.size} onClick={() => confirm([...sel])}>Confirm selected ({sel.size})</button>
        <button className="btn btn-secondary btn-sm" disabled={!high.length} onClick={() => confirm(high)}>Confirm all high-confidence with quantities ({high.length})</button>
        <span className="text-sm text-muted">{drafts.length} waiting · {rows.length - drafts.length} confirmed</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="tbl">
          <thead><tr><th style={{ width: 30 }} /><th>Item</th><th>Description</th><th>Qty</th><th>Unit</th><th>Source & sheet</th><th>Confidence</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => {
              const low = r.confidence === "LOW" || r.quantity == null;
              return (
                <tr key={r.id} className={r.status === "DRAFT" && low ? "row-warn" : ""}>
                  <td>{r.status === "DRAFT" && <input type="checkbox" checked={sel.has(r.id)} onChange={(e) => { const s = new Set(sel); e.target.checked ? s.add(r.id) : s.delete(r.id); setSel(s); }} />}</td>
                  <td><input className="cell-input w-16 font-mono" defaultValue={r.itemNumber} onBlur={(e) => e.target.value !== r.itemNumber && edit(r.id, "itemNumber", e.target.value)} /></td>
                  <td><input className="cell-input" defaultValue={r.description} onBlur={(e) => e.target.value !== r.description && edit(r.id, "description", e.target.value)} /></td>
                  <td><input className="cell-input w-28 text-right" type="number" step="any" defaultValue={r.quantity ?? ""} onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== r.quantity) edit(r.id, "quantity", v); }} /></td>
                  <td><input className="cell-input w-16" defaultValue={r.unit} onBlur={(e) => e.target.value !== r.unit && edit(r.id, "unit", e.target.value)} /></td>
                  <td className="text-xs">
                    {r.source.replace("_", " ").toLowerCase()}
                    {r.documentId && <> · <Link className="text-navy-700 hover:underline" href={`/projects/${projectId}/viewer?doc=${r.documentId}&page=${(r.pageIndex ?? 0) + 1}`}>{docs[r.documentId] ?? "document"} p.{(r.pageIndex ?? 0) + 1}</Link></>}
                    {r.sourceNote && <div className="text-muted">{r.sourceNote}</div>}
                  </td>
                  <td>
                    {r.aiExtracted && r.status === "DRAFT" && <span className="flag flag-warn mr-1">AI draft</span>}
                    {low ? <span className="flag flag-warn">⚠ {r.quantity == null ? "No qty" : "Low"}</span> : <span className="flag flag-muted">High</span>}
                  </td>
                  <td className="text-right">
                    {r.status === "DRAFT"
                      ? <button className="btn btn-primary btn-sm" disabled={r.quantity == null} onClick={() => confirm([r.id])}>Confirm</button>
                      : <span className="flex items-center justify-end gap-2"><span className="flag flag-ok">✓ Confirmed</span><button className="text-xs text-faint hover:text-night" onClick={() => start(async () => { await unconfirmBidItem(projectId, r.id); setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: "DRAFT" } : x))); })}>undo</button></span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
