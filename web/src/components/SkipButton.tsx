"use client";
import { useRouter } from "next/navigation";
import { skipStep } from "@/app/actions/setup";

export function SkipButton({ step, nextHref }: { step: string; nextHref: string }) {
  const router = useRouter();
  return <button type="button" className="btn btn-secondary" onClick={async () => { await skipStep(step); router.push(nextHref); }}>Skip for now</button>;
}
