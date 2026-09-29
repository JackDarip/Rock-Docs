"use client";

import { useRef, useState, useTransition } from "react";
import { saveRow, deleteRow } from "@/app/actions/crud";
import type { EntityName } from "@/lib/entities";
import { GLOSSARY } from "@/config/glossary";

export type Column = {
  key: string;
  label: string;
  type?: "text" | "number" | "money" | "pct" | "select" | "checkbox" | "date" | "list" | "readonly";
  options?: { value: string; label: string }[];
  width?: string;
  required?: boolean;
  placeholder?: string;
  term?: string;
  step?: string;
};

type Row = Record<string, any> & { id?: string; _key: string };

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;

/**
 * Inline table with autosave. Each cell saves on blur; new rows are created
 * as soon as their required fields are filled. Nothing needs a Save button.
 */
export function EditableTable({
  entity, columns, rows: initial, readOnly = false, projectId, defaults = {}, addLabel = "Add row",
  flagRow, emptyHint,
}: {
  entity: EntityName; columns: Column[]; rows: Record<string, any>[]; readOnly?: boolean; projectId?: string;
  defaults?: Record<string, any>; addLabel?: string; flagRow?: { key: string; equals: any; label: string };
  emptyHint?: string;
}) {
  const [rows, setRows] = useState<Row[]>(() => initial.map((r) => ({ ...r, _key: r.id ?? nextKey() })));
  const [status, setStatus] = useState<Record<string, string>>({});
  const [, start] = useTransition();
  const dirty = useRef<Record<string, Record<string, any>>>({});
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const setCell = (key: string, col: string, value: any) => {
    setRows((rs) => rs.map((r) => (r._key === key ? { ...r, [col]: value } : r)));
    dirty.current[key] = { ...(dirty.current[key] ?? {}), [col]: value };
  };

  const creating = useRef<Record<string, boolean>>({});

  const commit = (key: string) => {
    const row = rowsRef.current.find((r) => r._key === key);
    const changes = dirty.current[key];
    if (!row || !changes || readOnly) return;
    // A create for this row is still in flight: keep the edits queued and
    // save them as an update once the new row has its id.
    if (creating.current[key]) return;
    const missing = columns.filter((c) => c.required && (row[c.key] === "" || row[c.key] == null));
    if (!row.id && missing.length) {
      setStatus((s) => ({ ...s, [key]: `Fill in ${missing.map((m) => m.label).join(", ")} to save` }));
      return;
    }
    const payload = row.id ? changes : Object.fromEntries(Object.entries({ ...defaults, ...row }).filter(([k]) => !k.startsWith("_") && k !== "id"));
    delete dirty.current[key];
    const isCreate = !row.id;
    if (isCreate) creating.current[key] = true;
    setStatus((s) => ({ ...s, [key]: "Saving…" }));
    start(async () => {
      const res = await saveRow(entity, row.id ?? null, payload, { projectId });
      if (isCreate) creating.current[key] = false;
      if (res.ok) {
        setRows((rs) => rs.map((r) => (r._key === key ? { ...r, id: res.id } : r)));
        rowsRef.current = rowsRef.current.map((r) => (r._key === key ? { ...r, id: res.id } : r));
        setStatus((s) => ({ ...s, [key]: "Saved ✓" }));
        setTimeout(() => setStatus((s) => (s[key] === "Saved ✓" ? { ...s, [key]: "" } : s)), 1800);
        if (isCreate && dirty.current[key]) commit(key);
      } else {
        dirty.current[key] = { ...(dirty.current[key] ?? {}), ...changes };
        setStatus((s) => ({ ...s, [key]: `⚠ ${res.error}` }));
      }
    });
  };

  const remove = (key: string) => {
    const row = rows.find((r) => r._key === key);
    if (!row) return;
    if (row.id && !confirm("Delete this row? This can't be undone.")) return;
    setRows((rs) => rs.filter((r) => r._key !== key));
    if (row.id) start(async () => { await deleteRow(entity, row.id!); });
  };

  const add = () => {
    const blank: Row = { _key: nextKey(), ...defaults };
    for (const c of columns) if (!(c.key in blank)) blank[c.key] = c.type === "checkbox" ? false : c.type === "list" ? [] : "";
    setRows((rs) => [...rs, blank]);
  };

  const input = (row: Row, c: Column) => {
    const v = row[c.key];
    const common = { disabled: readOnly, onBlur: () => commit(row._key), className: "cell-input", placeholder: c.placeholder, "aria-label": c.label };
    switch (c.type) {
      case "readonly":
        return <span className="text-muted">{v ?? "—"}</span>;
      case "checkbox":
        return (
          <input type="checkbox" checked={!!v} disabled={readOnly} aria-label={c.label}
            onChange={(e) => { setCell(row._key, c.key, e.target.checked); setTimeout(() => commit(row._key), 0); }} />
        );
      case "select":
        return (
          <select {...common} value={v ?? ""} onChange={(e) => { setCell(row._key, c.key, e.target.value || null); setTimeout(() => commit(row._key), 0); }}>
            <option value="">—</option>
            {c.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
      case "date":
        return <input {...common} type="date" value={v ? String(v).slice(0, 10) : ""} onChange={(e) => setCell(row._key, c.key, e.target.value)} />;
      case "list":
        return <input {...common} value={Array.isArray(v) ? v.join(", ") : v ?? ""} onChange={(e) => setCell(row._key, c.key, e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />;
      case "number": case "money": case "pct":
        return (
          <div className="flex items-center">
            {c.type === "money" && <span className="pl-1 text-faint">$</span>}
            <input {...common} type="number" step={c.step ?? "any"} value={v ?? ""} className="cell-input text-right"
              onChange={(e) => setCell(row._key, c.key, e.target.value === "" ? null : Number(e.target.value))} />
            {c.type === "pct" && <span className="pr-1 text-faint">%</span>}
          </div>
        );
      default:
        return <input {...common} value={v ?? ""} onChange={(e) => setCell(row._key, c.key, e.target.value)} />;
    }
  };

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="tbl">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={{ width: c.width }}>
                  {c.term && GLOSSARY[c.term] ? (
                    <span className="term" tabIndex={0}>{c.label}<span className="term-tip">{GLOSSARY[c.term]}</span></span>
                  ) : c.label}
                  {c.required && <span className="text-brand"> *</span>}
                </th>
              ))}
              <th style={{ width: 150 }} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="py-6 text-center text-muted">{emptyHint ?? "Nothing here yet."}</td></tr>
            )}
            {rows.map((row) => {
              const flagged = flagRow && row[flagRow.key] === flagRow.equals;
              return (
                <tr key={row._key} className={flagged ? "row-warn" : ""}>
                  {columns.map((c) => <td key={c.key}>{input(row, c)}</td>)}
                  <td className="whitespace-nowrap text-right text-xs">
                    {flagged && <span className="flag flag-warn mr-1">⚠ {flagRow!.label}</span>}
                    <span className={status[row._key]?.startsWith("⚠") ? "text-warn" : "text-ok"}>{status[row._key]}</span>
                    {!readOnly && (
                      <button type="button" onClick={() => remove(row._key)} className="ml-2 text-faint hover:text-danger" aria-label="Delete row">✕</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <button type="button" onClick={add} className="btn btn-secondary btn-sm mt-3">+ {addLabel}</button>
      )}
    </div>
  );
}
