import Link from "next/link";

export function SetupProgress({ steps }: { steps: { key: string; label: string; href: string; done: boolean; skipped: boolean; blurb?: string }[] }) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5 min-[1600px]:grid-cols-9">
      {steps.map((s, i) => (
        <li key={s.key}>
          <Link href={s.href} className={`block rounded-xl border p-3 text-sm transition hover:border-brand ${s.done ? "border-emerald-200 bg-ok-bg" : s.skipped ? "border-line bg-paper" : "border-line bg-white"}`}>
            <div className="flex items-center gap-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${s.done ? "bg-ok text-white" : "bg-mist text-navy-800"}`}>{s.done ? "✓" : i + 1}</span>
              <span className="font-semibold leading-tight">{s.label}</span>
            </div>
            <div className="mt-1 text-xs text-muted">{s.done ? "Has data" : s.skipped ? "Skipped for now" : "Not started"}</div>
          </Link>
        </li>
      ))}
    </ol>
  );
}
