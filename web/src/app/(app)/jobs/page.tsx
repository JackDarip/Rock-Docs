import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { PageHeader, Card, EmptyState, fmtDate, fmtDateTime } from "@/components/ui";
import { createJob } from "@/app/actions/jobs";
import { Suggestion, RecalcButton } from "@/components/PastJobs";
import { PRODUCT_NAME } from "@/config/brand";

export default async function PastJobs() {
  const { db, isAdmin } = await requireCtx();
  const [jobs, lines, sugs, rates, decided] = await Promise.all([
    db.historicalJob.findMany({ orderBy: { createdAt: "desc" } }),
    db.jobCostLine.groupBy({ by: ["jobId", "status"], _count: true }),
    db.calibrationSuggestion.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    db.productionRate.findMany(),
    db.calibrationSuggestion.findMany({ where: { status: { in: ["APPROVED", "EDITED"] } }, orderBy: { decidedAt: "desc" }, take: 10 }),
  ]);
  const count = (jobId: string, status?: string) => lines.filter((l) => l.jobId === jobId && (!status || l.status === status)).reduce((a, l) => a + l._count, 0);
  const rate = (id: string) => rates.find((r) => r.id === id);
  return (
    <>
      <PageHeader title="Past jobs" subtitle={<>Teach {PRODUCT_NAME} from jobs you&apos;ve finished. Upload job cost reports (or type them in), check every line, and map activities to your production rates. {PRODUCT_NAME} then suggests rate changes; nothing changes until you approve it.</>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <Card title={<>Calibration suggestions {sugs.length > 0 && <span className="flag flag-warn ml-1">{sugs.length}</span>}</>} actions={<RecalcButton />}>
            {sugs.length === 0 ? <p className="text-sm text-muted">No suggestions right now. They appear when a reviewed past job has lines mapped to a production rate and its real output differs by more than 3%.</p> : (
              <ul className="space-y-3">{sugs.map((s) => {
                const r = rate(s.productionRateId);
                const b = s.basis as any;
                return <Suggestion key={s.id} isAdmin={isAdmin} s={{ id: s.id, activity: r?.activity ?? "Deleted rate", unit: r?.unit ?? "", current: s.currentOutput, suggested: s.suggestedOutput, method: b?.method ?? "HOURS", jobs: b?.jobs ?? [] }} />;
              })}</ul>
            )}
            {decided.length > 0 && (
              <details className="mt-4 text-sm"><summary className="cursor-pointer text-muted">Recently applied ({decided.length})</summary>
                <ul className="mt-1 space-y-0.5 text-muted">{decided.map((d) => <li key={d.id}>{fmtDateTime(d.decidedAt)} · {rate(d.productionRateId)?.activity}: {d.currentOutput ?? "—"} → {d.appliedOutput} {rate(d.productionRateId)?.unit}/day</li>)}</ul>
              </details>
            )}
          </Card>
          <Card title="Jobs">
            {jobs.length === 0 ? <EmptyState title="No past jobs yet" body="Add a finished job to start. Upload its final job cost report and, if you have it, the original bid estimate. You can also close out a bid you built here from its Overview page." /> : (
              <table className="tbl">
                <thead><tr><th>Job</th><th>Type</th><th>Completed</th><th className="text-right">Lines</th><th className="text-right">To review</th><th>Status</th></tr></thead>
                <tbody>{jobs.map((j) => (
                  <tr key={j.id}>
                    <td><Link className="font-semibold text-navy-700 hover:underline" href={`/jobs/${j.id}`}>{j.name}</Link>{j.jobNumber && <span className="ml-1 text-xs text-muted">#{j.jobNumber}</span>}</td>
                    <td className="text-sm">{j.kind === "CLOSEOUT" ? "Close-out" : "Imported"}</td>
                    <td className="text-sm">{fmtDate(j.completedAt)}</td>
                    <td className="text-right tabular-nums">{count(j.id)}</td>
                    <td className="text-right tabular-nums">{count(j.id, "DRAFT") || ""}</td>
                    <td>{j.status === "REVIEWED" ? <span className="flag flag-ok">Reviewed</span> : <span className="flag flag-muted">In review</span>}</td>
                  </tr>))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
        <Card title="Add a past job">
          <form action={createJob} className="space-y-3">
            <div><label className="label" htmlFor="pj-name">Job name *</label><input id="pj-name" name="name" required className="input" placeholder="Riverside Waterline Replacement" /></div>
            <div><label className="label" htmlFor="pj-num">Job number</label><input id="pj-num" name="jobNumber" className="input" /></div>
            <div><label className="label" htmlFor="pj-done">Completed</label><input id="pj-done" name="completedAt" type="date" className="input" /></div>
            <button className="btn btn-primary">Add job</button>
          </form>
        </Card>
      </div>
    </>
  );
}
