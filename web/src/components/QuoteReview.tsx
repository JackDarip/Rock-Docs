"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateQuote, confirmQuote, deleteQuote } from "@/app/actions/rfq";

type Q = { id: string; supplierId: string | null; supplierName: string | null; quoteNumber: string | null; quotedAt: string | null; validUntil: string | null; taxIncluded: boolean | null; freightIncluded: boolean | null; minimumOrder: string | null; exclusions: string | null; notes: string | null; status: string };

export function QuoteHeader({ quote, suppliers, projectId }: { quote: Q; suppliers: { id: string; name: string }[]; projectId: string }) {
  const [q, setQ] = useState(quote);
  const [msg, setMsg] = useState("");
  const [, start] = useTransition();
  const router = useRouter();
  const save = (patch: Partial<Q>) => { setQ({ ...q, ...patch }); start(async () => { await updateQuote(q.id, patch); router.refresh(); }); };
  const yn = (v: boolean | null) => (v == null ? "" : v ? "Y" : "N");
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <div className="md:col-span-2">
        <label className="label">Supplier</label>
        <select className="input" value={q.supplierId ?? ""} onChange={(e) => save({ supplierId: e.target.value || null })}>
          <option value="">{q.supplierName ? `${q.supplierName} (not in directory)` : "— pick the supplier —"}</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {!q.supplierId && <input className="input mt-1" placeholder="…or type a name" defaultValue={q.supplierName ?? ""} onBlur={(e) => e.target.value !== (q.supplierName ?? "") && save({ supplierName: e.target.value || null })} />}
      </div>
      <div><label className="label">Quote #</label><input className="input" defaultValue={q.quoteNumber ?? ""} onBlur={(e) => save({ quoteNumber: e.target.value || null })} /></div>
      <div><label className="label">Quote date</label><input type="date" className="input" defaultValue={q.quotedAt?.slice(0, 10) ?? ""} onBlur={(e) => save({ quotedAt: e.target.value || null })} /></div>
      <div><label className="label">Valid until</label><input type="date" className="input" defaultValue={q.validUntil?.slice(0, 10) ?? ""} onBlur={(e) => save({ validUntil: e.target.value || null })} /></div>
      <div><label className="label">Tax included?</label><select className="input" value={yn(q.taxIncluded)} onChange={(e) => save({ taxIncluded: e.target.value === "" ? null : e.target.value === "Y" })}><option value="">Unknown</option><option value="Y">Yes</option><option value="N">No</option></select></div>
      <div><label className="label">Freight included?</label><select className="input" value={yn(q.freightIncluded)} onChange={(e) => save({ freightIncluded: e.target.value === "" ? null : e.target.value === "Y" })}><option value="">Unknown</option><option value="Y">Yes</option><option value="N">No</option></select></div>
      <div><label className="label">Minimum order</label><input className="input" defaultValue={q.minimumOrder ?? ""} onBlur={(e) => save({ minimumOrder: e.target.value || null })} /></div>
      <div className="md:col-span-2"><label className="label">Exclusions</label><textarea className="input" rows={2} defaultValue={q.exclusions ?? ""} onBlur={(e) => save({ exclusions: e.target.value || null })} /></div>
      <div className="md:col-span-2"><label className="label">Notes</label><textarea className="input" rows={2} defaultValue={q.notes ?? ""} onBlur={(e) => save({ notes: e.target.value || null })} /></div>
      <div className="flex items-center gap-2 md:col-span-4">
        {q.status !== "CONFIRMED" ? (
          <button className="btn btn-primary" onClick={() => start(async () => { const r = await confirmQuote(q.id); setMsg(r.ok ? "Confirmed ✓ It now appears in Compare." : `⚠ ${r.error}`); router.refresh(); })}>Confirm quote</button>
        ) : <span className="flag flag-ok">✓ Confirmed</span>}
        <button className="btn btn-ghost text-danger" onClick={() => { if (confirm("Delete this quote and its lines?")) start(async () => { await deleteQuote(q.id); router.push(`/projects/${projectId}/quotes`); }); }}>Delete quote</button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>
    </div>
  );
}
