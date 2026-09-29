import Link from "next/link";
import { SETUP_STEPS } from "@/lib/setup";
import { SkipButton } from "./SkipButton";

/** Prev / skip / next controls shown at the bottom of every setup step. */
export function StepNav({ current }: { current: string }) {
  const i = SETUP_STEPS.findIndex((s) => s.key === current);
  const prev = SETUP_STEPS[i - 1];
  const next = SETUP_STEPS[i + 1];
  return (
    <div className="mt-8 flex items-center justify-between border-t border-line pt-4">
      {prev ? <Link className="btn btn-ghost" href={prev.href}>← {prev.label}</Link> : <Link className="btn btn-ghost" href="/setup">← Setup overview</Link>}
      <div className="flex gap-2">
        <SkipButton step={current} nextHref={next?.href ?? "/setup"} />
        <Link className="btn btn-primary" href={next?.href ?? "/setup"}>{next ? `Next: ${next.label} →` : "Finish"}</Link>
      </div>
    </div>
  );
}
