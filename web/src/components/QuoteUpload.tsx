"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadQuotes } from "@/app/actions/rfq";

export function QuoteUpload({ projectId, suppliers }: { projectId: string; suppliers: { id: string; name: string }[] }) {
  const [msgs, setMsgs] = useState<{ file: string; status: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <form className="rounded-2xl border-2 border-dashed border-mist bg-white p-6" action={async (fd) => {
      setBusy(true);
      try { setMsgs(await uploadQuotes(projectId, fd)); } finally { setBusy(false); }
      router.refresh();
    }}>
      <div className="font-display text-2xl font-bold">Bring in supplier quotes</div>
      <p className="mt-1 text-sm text-muted">Drop several at once: filled-in RFQ spreadsheets (.xlsx) match by RFQ number and hidden line IDs; suppliers&apos; own PDF quotes (even scanned) are read by AI. Every quote goes to review before any price is used.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input type="file" name="files" multiple accept=".xlsx,.pdf" required className="text-sm" />
        <select name="supplierId" className="input w-64"><option value="">Supplier: detect from the file</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <button className="btn btn-primary" disabled={busy}>{busy ? "Uploading…" : "Upload quotes"}</button>
      </div>
      {msgs.length > 0 && <ul className="mt-3 space-y-1 text-sm">{msgs.map((m, i) => <li key={i}><strong>{m.file}:</strong> <span className="text-muted">{m.status}</span></li>)}</ul>}
    </form>
  );
}
