"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { selectQuoteLine, selectSupplierForAll, approvePriceUpdates } from "@/app/actions/rfq";

export function PickCell({ projectId, materialLineId, quoteLineId, selected, label, low, alt }: { projectId: string; materialLineId: string; quoteLineId: string; selected: boolean; label: string; low: boolean; alt: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <label className={`flex cursor-pointer items-center justify-end gap-1.5 rounded px-1 ${low ? "bg-ok-bg font-semibold text-ok" : ""} ${selected ? "ring-2 ring-brand" : ""}`}>
      {alt && <span className="flag flag-warn" title="Offered as an alternate: confirm it meets spec">alt</span>}
      {label}
      <input type="radio" name={`pick-${materialLineId}`} defaultChecked={selected} onChange={() => start(async () => { await selectQuoteLine(projectId, materialLineId, quoteLineId); router.refresh(); })} />
    </label>
  );
}

export function ClearPick({ projectId, materialLineId }: { projectId: string; materialLineId: string }) {
  const router = useRouter();
  return <button className="text-xs text-faint hover:text-night" onClick={async () => { await selectQuoteLine(projectId, materialLineId, null); router.refresh(); }}>clear</button>;
}

export function UseSupplierForAll({ projectId, quoteId }: { projectId: string; quoteId: string }) {
  const router = useRouter();
  return <button className="text-xs text-navy-700 hover:underline" onClick={async () => { await selectSupplierForAll(projectId, quoteId); router.refresh(); }}>Use for all its lines</button>;
}

export function ApprovePrices({ projectId, count }: { projectId: string; count: number }) {
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <span className="flex items-center gap-2">
      <button className="btn btn-secondary btn-sm" disabled={!count} onClick={async () => {
        if (!confirm(`Update your company's material prices with the ${count} selected quote price(s)? Price history is kept.`)) return;
        try { const n = await approvePriceUpdates(projectId); setMsg(`${n} material price${n === 1 ? "" : "s"} updated.`); } catch (e: any) { setMsg(`⚠ ${e.message}`); }
        router.refresh();
      }}>Approve: update company prices ({count})</button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </span>
  );
}
