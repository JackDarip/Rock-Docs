"use client";
import { useRouter } from "next/navigation";
import { applyTakeoffQuantity } from "@/app/actions/project";

export function TakeoffApply({ projectId, bidItemId, qty }: { projectId: string; bidItemId: string; qty: number }) {
  const router = useRouter();
  return <button className="btn btn-secondary btn-sm" onClick={async () => { if (confirm(`Use your takeoff quantity (${qty.toLocaleString()}) for this bid item? It will be marked confirmed with "your takeoff" as the source.`)) { await applyTakeoffQuantity(projectId, bidItemId, Math.round(qty * 100) / 100); router.refresh(); } }}>Use takeoff qty</button>;
}
