"use client";
import { useState, useTransition } from "react";
import { updateProject } from "@/app/actions/project";

type F = { key: string; label: string; type?: "text" | "number" | "datetime" | "select" | "textarea"; options?: [string, string][]; placeholder?: string; suffix?: string; help?: string; span?: boolean };

export function ProjectForm({ projectId, values, fields, readOnly }: { projectId: string; values: Record<string, any>; fields: F[]; readOnly?: boolean }) {
  const [v, setV] = useState<Record<string, any>>(values);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [, start] = useTransition();
  const save = (key: string, raw: any) => start(async () => {
    const f = fields.find((x) => x.key === key)!;
    const value = f.type === "number" ? (raw === "" || raw == null ? null : Number(raw)) : raw === "" ? null : raw;
    const r = await updateProject(projectId, key, value);
    setMsg((m) => ({ ...m, [key]: r.ok ? "Saved ✓" : `⚠ ${r.error}` }));
  });
  const toLocal = (d: any) => (d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "");
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {fields.map((f) => (
        <div key={f.key} className={f.span ? "md:col-span-2" : ""}>
          <label className="label">{f.label}</label>
          <div className="flex items-center gap-2">
            {f.type === "select" ? (
              <select className="input" disabled={readOnly} value={v[f.key] ?? ""} onChange={(e) => { setV({ ...v, [f.key]: e.target.value }); save(f.key, e.target.value); }}>
                <option value="">—</option>{f.options!.map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}
              </select>
            ) : f.type === "textarea" ? (
              <textarea className="input" rows={3} disabled={readOnly} value={v[f.key] ?? ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} onBlur={(e) => save(f.key, e.target.value)} />
            ) : (
              <input className="input" disabled={readOnly} placeholder={f.placeholder} type={f.type === "datetime" ? "datetime-local" : f.type === "number" ? "number" : "text"} step="any"
                value={f.type === "datetime" ? toLocal(v[f.key]) : v[f.key] ?? ""}
                onChange={(e) => setV({ ...v, [f.key]: f.type === "datetime" ? (e.target.value ? new Date(e.target.value).toISOString() : null) : e.target.value })}
                onBlur={(e) => save(f.key, f.type === "datetime" ? (e.target.value ? new Date(e.target.value).toISOString() : null) : e.target.value)} />
            )}
            {f.suffix && <span className="text-sm text-muted">{f.suffix}</span>}
          </div>
          {f.help && <p className="mt-1 text-xs text-muted">{f.help}</p>}
          {msg[f.key] && <p className={`mt-1 text-xs ${msg[f.key].startsWith("⚠") ? "text-warn" : "text-ok"}`}>{msg[f.key]}</p>}
        </div>
      ))}
    </div>
  );
}
