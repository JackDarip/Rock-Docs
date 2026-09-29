"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { rebuildMaterialList } from "@/app/actions/project";
import { generateRfqs } from "@/app/actions/rfq";

export function RebuildMaterials({ projectId }: { projectId: string }) {
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <span className="flex items-center gap-2">
      <button className="btn btn-primary btn-sm" onClick={async () => { setMsg("Building…"); const r = await rebuildMaterialList(projectId); setMsg(`${r.count} materials from confirmed quantities${r.removed ? `, ${r.removed} removed` : ""}.`); router.refresh(); }}>Rebuild from estimate</button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </span>
  );
}

export function GenerateRfqs({ projectId }: { projectId: string }) {
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <span className="flex items-center gap-2">
      <button className="btn btn-primary btn-sm" onClick={async () => {
        setMsg("Generating…");
        const r = await generateRfqs(projectId);
        setMsg(r.length ? r.map((x) => `${x.category}: ${x.action}`).join(" · ") : "Nothing to quote: build the material list first.");
        router.refresh();
      }}>Generate / refresh RFQs</button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </span>
  );
}
