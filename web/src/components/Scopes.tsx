"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveScope, deleteScope } from "@/app/actions/scopes";
import { Icon } from "./Icon";

type BidItem = { id: string; itemNumber: string; description: string; quantity: number | null; unit: string };
type Line = { bidItemId: string | null; itemNumber: string; description: string; quantity: number | null; unit: string; note: string | null };
type Scope = { id: string; name: string; trade: string | null; description: string | null; lines: Line[] };
type Sub = { id: string; name: string; categories: string[]; email: string | null };

export function ScopeEditor({ projectId, bidItems, trades, scope, onDone }: { projectId: string; bidItems: BidItem[]; trades: { code: string; name: string }[]; scope?: Scope; onDone?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [s, setS] = useState<Omit<Scope, "id">>(scope ?? { name: "", trade: null, description: "", lines: [] });
  const [err, setErr] = useState("");
  const has = (id: string) => s.lines.some((l) => l.bidItemId === id);
  const toggle = (b: BidItem) => setS({ ...s, lines: has(b.id) ? s.lines.filter((l) => l.bidItemId !== b.id) : [...s.lines, { bidItemId: b.id, itemNumber: b.itemNumber, description: b.description, quantity: b.quantity, unit: b.unit, note: null }] });
  const upd = (i: number, patch: Partial<Line>) => setS({ ...s, lines: s.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  return (
    <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
      <div>
        <div className="label">Bid items in this scope</div>
        <ul className="max-h-96 space-y-1 overflow-auto rounded-lg border border-line p-2 text-sm">
          {bidItems.map((b) => (
            <li key={b.id}><label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={has(b.id)} onChange={() => toggle(b)} /><span><span className="font-mono text-xs text-muted">{b.itemNumber}</span> {b.description} <span className="text-xs text-muted">({b.quantity?.toLocaleString() ?? "—"} {b.unit})</span></span></label></li>
          ))}
        </ul>
      </div>
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div><label className="label" htmlFor="sc-name">Package name</label><input id="sc-name" className="input" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder="Pavement striping" /></div>
          <div><label className="label" htmlFor="sc-trade">Trade</label><input id="sc-trade" className="input" list="sc-trades" value={s.trade ?? ""} onChange={(e) => setS({ ...s, trade: e.target.value || null })} /><datalist id="sc-trades">{trades.map((t) => <option key={t.code} value={t.name} />)}</datalist></div>
        </div>
        <div><label className="label" htmlFor="sc-desc">Scope description</label><textarea id="sc-desc" className="input" rows={3} value={s.description ?? ""} onChange={(e) => setS({ ...s, description: e.target.value })} placeholder="Furnish and install all permanent pavement markings per sheets C-501 to C-503. Traffic control by others." /></div>
        <table className="tbl">
          <thead><tr><th>Item</th><th>Description</th><th className="text-right">Qty</th><th>Unit</th><th>Note</th><th /></tr></thead>
          <tbody>{s.lines.map((l, i) => (
            <tr key={i}>
              <td className="font-mono text-xs">{l.itemNumber}</td>
              <td><input aria-label="Description" className="cell-input" value={l.description} onChange={(e) => upd(i, { description: e.target.value })} /></td>
              <td><input aria-label="Quantity" className="cell-input w-24 text-right" value={l.quantity ?? ""} onChange={(e) => upd(i, { quantity: e.target.value === "" ? null : Number(e.target.value) })} /></td>
              <td><input aria-label="Unit" className="cell-input w-14" value={l.unit} onChange={(e) => upd(i, { unit: e.target.value })} /></td>
              <td><input aria-label="Note" className="cell-input" value={l.note ?? ""} onChange={(e) => upd(i, { note: e.target.value || null })} /></td>
              <td><button className="text-faint hover:text-danger" aria-label="Remove" onClick={() => setS({ ...s, lines: s.lines.filter((_, j) => j !== i) })}>✕</button></td>
            </tr>))}
            {!s.lines.length && <tr><td colSpan={6} className="text-sm text-muted">Tick bid items on the left, or add a line.</td></tr>}
          </tbody>
        </table>
        <button className="btn btn-secondary btn-sm" onClick={() => setS({ ...s, lines: [...s.lines, { bidItemId: null, itemNumber: "—", description: "", quantity: null, unit: "LS", note: null }] })}>+ Add line</button>
        {err && <p className="text-sm text-warn">⚠ {err}</p>}
        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => { const r = await saveScope(projectId, scope?.id ?? null, s); if (!r.ok) setErr(r.error); else { if (!scope) setS({ name: "", trade: s.trade, description: "", lines: [] }); onDone?.(); router.refresh(); } })}>{pending ? "Saving…" : scope ? "Save changes" : "Create package"}</button>
          {onDone && <button className="btn btn-secondary" onClick={onDone}>Cancel</button>}
        </div>
      </div>
    </div>
  );
}

export function ScopeCard({ projectId, scope, bidItems, trades, subs, projectName }: { projectId: string; scope: Scope; bidItems: BidItem[]; trades: { code: string; name: string }[]; subs: Sub[]; projectName: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [edit, setEdit] = useState(false);
  const [copied, setCopied] = useState(false);
  const tradeCode = trades.find((t) => t.name === scope.trade)?.code;
  const suggested = subs.filter((x) => tradeCode && x.categories.includes(tradeCode));
  const subject = `Subcontract quote request: ${scope.name} for ${projectName}`;
  const body = `Please quote the attached scope for ${projectName}.\n\n${scope.description ?? ""}\n\n${scope.lines.map((l) => `${l.itemNumber}  ${l.description}  ${l.quantity?.toLocaleString() ?? ""} ${l.unit}`).join("\n")}\n\nThe spreadsheet is attached; fill in the yellow unit price cells and reply with it.`;
  if (edit) return <section className="card p-5"><ScopeEditor projectId={projectId} bidItems={bidItems} trades={trades} scope={scope} onDone={() => setEdit(false)} /></section>;
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="text-xl font-bold">{scope.name}</div><div className="text-sm text-muted">{scope.trade ?? "No trade"} · {scope.lines.length} line{scope.lines.length === 1 ? "" : "s"}</div></div>
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-primary btn-sm" href={`/api/scopes/${scope.id}?format=xlsx`}><Icon name="download" size={15} />Excel</a>
          <a className="btn btn-secondary btn-sm" href={`/api/scopes/${scope.id}?format=pdf`}>PDF</a>
          <button className="btn btn-secondary btn-sm" onClick={() => setEdit(true)}>Edit</button>
          <button className="btn btn-secondary btn-sm" onClick={() => { if (confirm(`Delete "${scope.name}"?`)) start(async () => { await deleteScope(scope.id); router.refresh(); }); }}>Delete</button>
        </div>
      </div>
      {scope.description && <p className="mt-2 whitespace-pre-wrap text-sm">{scope.description}</p>}
      <table className="tbl mt-3"><thead><tr><th>Item</th><th>Description</th><th className="text-right">Qty</th><th>Unit</th><th>Note</th></tr></thead>
        <tbody>{scope.lines.map((l, i) => <tr key={i}><td className="font-mono text-xs">{l.itemNumber}</td><td>{l.description}</td><td className="text-right">{l.quantity?.toLocaleString() ?? "—"}</td><td>{l.unit}</td><td className="text-sm text-muted">{l.note}</td></tr>)}</tbody></table>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Send to subs:</span>
        <button className="btn btn-secondary btn-sm" onClick={async () => { await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied ✓" : "Copy email text"}</button>
        <a className="btn btn-secondary btn-sm" href={`mailto:${suggested.map((x) => x.email).filter(Boolean).join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>Open in my email{suggested.length ? ` (${suggested.length} ${scope.trade} sub${suggested.length === 1 ? "" : "s"})` : ""}</a>
        {!suggested.length && <a className="text-xs text-navy-700 underline" href="/setup/suppliers?kind=SUBCONTRACTOR">Add {scope.trade ?? ""} subcontractors</a>}
      </div>
    </section>
  );
}
