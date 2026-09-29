"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { importSuppliers } from "@/app/actions/setup";
import { FilePicker } from "./FilePicker";

export function ImportForm({ kind }: { kind: string }) {
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <form className="flex items-center gap-2" action={async (fd) => {
      setMsg("Importing…");
      const r = await importSuppliers(fd);
      setMsg(r.ok ? `Imported ${r.created}` : `⚠ ${r.error}`);
      router.refresh();
    }}>
      <input type="hidden" name="kind" value={kind} />
      <FilePicker name="file" accept=".csv,.xlsx" required label="Choose CSV/Excel" />
      <button className="btn btn-secondary btn-sm">Bulk import</button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </form>
  );
}
