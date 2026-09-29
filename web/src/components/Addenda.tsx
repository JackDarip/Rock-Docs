"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importAddendumSchedule, runAddendumExtraction, decideChange, acceptAllChanges, reviseAffectedRfqs } from "@/app/actions/addenda";
import { FilePicker } from "./FilePicker";

type Row = { itemNumber: string; description: string; unit: string; quantity: number | null; specSection: string | null; fields?: string[] };
type Change = { id: string; itemNumber: string; changeType: string; before: Row | null; after: Row | null; status: string };
const q = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 3 }));

export function FindChanges({ documentId, aiOn }: { documentId: string; aiOn: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <div className="label">Read the addendum&apos;s revised bid schedule</div>
        <button className="btn btn-secondary btn-sm" disabled={pending || !aiOn} onClick={() => start(async () => { const r = await runAddendumExtraction(documentId); setMsg(r.ok ? "Reading… changes appear below in a minute." : `⚠ ${r.error}`); router.refresh(); })}>Find changes with AI</button>
        {!aiOn && <p className="mt-1 text-xs text-muted">AI reading isn&apos;t switched on for this server. Use the spreadsheet option.</p>}
      </div>
      <form action={(fd) => start(async () => { const r = await importAddendumSchedule(documentId, fd); setMsg(r.ok ? `Found ${r.changes} change${r.changes === 1 ? "" : "s"}.` : `⚠ ${r.error}`); router.refresh(); })}>
        <div className="label">Or import the revised schedule (Excel / CSV)</div>
        <div className="flex flex-wrap items-center gap-2"><FilePicker name="file" accept=".xlsx,.csv" label="Choose file" /><button className="btn btn-secondary btn-sm" disabled={pending}>Compare</button></div>
      </form>
      {msg && <p className={`text-sm md:col-span-2 ${msg.startsWith("⚠") ? "text-warn" : "text-muted"}`}>{msg}</p>}
    </div>
  );
}

export function ChangeTable({ documentId, changes }: { documentId: string; changes: Change[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const pendingCount = changes.filter((c) => c.status === "PENDING").length;
  const hl = (c: Change, f: string) => (c.before?.fields?.includes(f) ? "bg-amber-100 font-semibold" : "");
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm text-muted">{pendingCount ? `${pendingCount} change${pendingCount === 1 ? "" : "s"} waiting for you` : "All changes decided"}</div>
        {pendingCount > 0 && <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => start(async () => { await acceptAllChanges(documentId); router.refresh(); })}>Accept all {pendingCount}</button>}
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Item</th><th>Change</th><th>Before</th><th>After</th><th /></tr></thead>
          <tbody>{changes.map((c) => (
            <tr key={c.id} className={c.status === "REJECTED" ? "opacity-50" : ""}>
              <td className="font-mono text-xs">{c.itemNumber}</td>
              <td><span className={`flag ${c.changeType === "ADDED" ? "flag-ok" : c.changeType === "REMOVED" ? "flag-warn" : "flag-info"}`}>{c.changeType === "ADDED" ? "New item" : c.changeType === "REMOVED" ? "Removed" : "Changed"}</span></td>
              <td className="text-sm">{c.before ? <><div className={hl(c, "description")}>{c.before.description}</div><div className="text-xs text-muted"><span className={hl(c, "quantity")}>{q(c.before.quantity)}</span> <span className={hl(c, "unit")}>{c.before.unit}</span></div></> : <span className="text-faint">—</span>}</td>
              <td className="text-sm">{c.after ? <><div className={hl(c, "description")}>{c.after.description}</div><div className="text-xs text-muted"><span className={hl(c, "quantity")}>{q(c.after.quantity)}</span> <span className={hl(c, "unit")}>{c.after.unit}</span>{c.before?.quantity != null && c.after.quantity != null && c.before.quantity !== c.after.quantity ? <span className="ml-1">({c.after.quantity > c.before.quantity ? "+" : ""}{q(c.after.quantity - c.before.quantity)})</span> : null}</div></> : <span className="text-faint">—</span>}</td>
              <td className="whitespace-nowrap text-right">
                {c.status === "PENDING" ? (
                  <span className="flex justify-end gap-2">
                    <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => start(async () => { await decideChange(c.id, true); router.refresh(); })}>Accept</button>
                    <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => { await decideChange(c.id, false); router.refresh(); })}>Keep current</button>
                  </span>
                ) : <span className="text-xs text-muted">{c.status === "ACCEPTED" ? "✓ Accepted" : "Kept current"}</span>}
              </td>
            </tr>))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ReviseRfqs({ projectId, numbers }: { projectId: string; numbers: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  return (
    <div className="rounded-xl border border-warn-line bg-warn-bg p-3 text-sm text-warn">
      ⚠ These RFQs were already sent or downloaded and no longer match the quantities: <strong>{numbers.join(", ")}</strong>.
      <div className="mt-2 flex items-center gap-2">
        <button className="btn btn-primary btn-sm" disabled={pending || done} onClick={() => start(async () => { await reviseAffectedRfqs(projectId); setDone(true); router.refresh(); })}>{pending ? "Creating…" : "Create revised RFQs"}</button>
        {done && <a className="text-navy-700 underline" href={`/projects/${projectId}/rfqs`}>Send the revisions →</a>}
      </div>
    </div>
  );
}
