import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { setupStatus } from "@/lib/setup";
import { PageHeader, Card } from "@/components/ui";
import { SetupProgress } from "@/components/SetupProgress";

export default async function SetupHome() {
  const { db, company, isAdmin } = await requireCtx();
  const status = await setupStatus(db, company);
  return (
    <>
      <PageHeader eyebrow="Make it yours" title="Company Setup"
        subtitle={<>Enter your real costs once and refine them anytime. There's no preloaded rate data: every number that feeds an estimate is yours. {!isAdmin && <strong>You can view setup; an Admin makes changes.</strong>}</>} />
      <Card className="mb-6">
        <div className="mb-3 flex items-center gap-4">
          <div className="font-display text-5xl font-bold text-night">{status.score}%</div>
          <div className="flex-1">
            <div className="h-3 overflow-hidden rounded-full bg-mist"><div className="h-full bg-brand" style={{ width: `${status.score}%` }} /></div>
            <p className="mt-1 text-sm text-muted">Setup completeness. Anything incomplete is flagged amber on estimates that depend on it.</p>
          </div>
        </div>
        <SetupProgress steps={status.steps} />
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {status.steps.map((s, i) => (
          <Link key={s.key} href={s.href} className="card block p-5 transition hover:border-brand">
            <div className="text-xs font-semibold uppercase text-brand">Step {i + 1}</div>
            <div className="text-xl font-bold">{s.label}</div>
            <p className="mt-1 text-sm text-muted">{s.blurb}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
