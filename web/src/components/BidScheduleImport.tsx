"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { importBidSchedule } from "@/app/actions/project";

export function BidScheduleImport({ projectId }: { projectId: string }) {
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <form className="flex flex-wrap items-center gap-2" action={async (fd) => {
      setMsg("Importing…");
      const r = await importBidSchedule(projectId, fd);
      setMsg(r.ok ? `Imported ${r.count} bid items as drafts. Review them next.` : `⚠ ${r.error}`);
      router.refresh();
    }}>
      <input type="file" name="file" accept=".xlsx,.csv" required className="text-sm" />
      <button className="btn btn-secondary btn-sm">Import Excel / CSV bid schedule</button>
      {msg && <span className="text-sm text-muted">{msg}</span>}
    </form>
  );
}
