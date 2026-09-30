import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { PageHeader, Card, fmtDate, fmtDateTime } from "@/components/ui";
import { JobUpload, JobLines, JobReviewed } from "@/components/PastJobs";
import { AutoRefresh } from "@/components/AutoRefresh";

export default async function JobDetail({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const { db, isAdmin } = await requireCtx();
  const job = await db.historicalJob.findUnique({ where: { id: jobId } });
  if (!job) notFound();
  const [files, lines, rates] = await Promise.all([
    db.jobCostFile.findMany({ where: { jobId }, orderBy: { createdAt: "asc" } }),
    db.jobCostLine.findMany({ where: { jobId }, orderBy: { sortOrder: "asc" } }),
    db.productionRate.findMany({ orderBy: { activity: "asc" } }),
  ]);
  const processing = files.some((f) => f.status === "PROCESSING");
  const fileLink = (fileId: string | null, page: number | null) => {
    const f = files.find((x) => x.id === fileId);
    if (!f) return null;
    return { href: `/api/jobfiles/${f.id}${/\.pdf$/i.test(f.filename) && page != null ? `#page=${page + 1}` : ""}`, label: `${f.filename}${page != null && /\.pdf$/i.test(f.filename) ? ` p.${page + 1}` : ""}` };
  };
  const totals = lines.filter((l) => l.status !== "IGNORED").reduce((a, l) => ({ est: a.est + (l.estimatedCost ?? 0), act: a.act + (l.actualCost ?? 0) }), { est: 0, act: 0 });
  return (
    <>
      <AutoRefresh active={processing} ms={4000} />
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider"><Link href="/jobs" className="text-muted hover:text-night">Past jobs</Link> <span className="text-faint">›</span> <span className="text-brand-600">{job.name}</span></div>
      <PageHeader title={job.name} subtitle={<>{job.jobNumber ? `Job ${job.jobNumber} · ` : ""}{job.kind === "CLOSEOUT" ? <>Close-out of <Link className="underline" href={`/projects/${job.projectId}`}>the bid</Link></> : "Imported job"}{job.completedAt ? ` · completed ${fmtDate(job.completedAt)}` : ""}</>} />
      <div className="space-y-6">
        {job.notes && <p className="text-sm text-muted">{job.notes}</p>}
        <Card title="Source documents">
          <JobUpload jobId={jobId} />
          {files.length > 0 && (
            <ul className="mt-4 divide-y divide-line text-sm">{files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><a className="font-semibold text-navy-700 hover:underline" href={`/api/jobfiles/${f.id}`} target="_blank" rel="noreferrer">{f.filename}</a> <span className="text-xs text-muted">· {f.role === "ACTUAL" ? "Job cost report" : f.role === "ESTIMATE" ? "Original estimate" : "Other"} · {fmtDateTime(f.createdAt)}</span></span>
                <span className={`text-xs ${f.status === "FAILED" ? "text-warn" : "text-muted"}`}>{f.status === "PROCESSING" ? "Reading…" : f.statusDetail}</span>
              </li>))}
            </ul>
          )}
        </Card>
        <Card title={<>Line items <span className="text-sm font-normal text-muted">· estimated ${totals.est.toLocaleString("en-US", { maximumFractionDigits: 0 })} vs actual ${totals.act.toLocaleString("en-US", { maximumFractionDigits: 0 })}{totals.est ? ` (${totals.act > totals.est ? "+" : ""}${(((totals.act - totals.est) / totals.est) * 100).toFixed(1)}%)` : ""}</span></>}>
          {lines.length === 0 ? <p className="text-sm text-muted">Upload a report above, or add lines by hand: <em>activity, quantity installed, estimated and actual cost, and labor hours</em>. Labor hours give the most accurate calibration.</p> : null}
          <JobLines jobId={jobId} kind={job.kind} isAdmin={isAdmin} rates={rates.map((r) => ({ id: r.id, activity: r.activity, unit: r.unit }))}
            lines={lines.map((l) => ({ id: l.id, activity: l.activity, quantity: l.quantity, unit: l.unit, estimatedCost: l.estimatedCost, actualCost: l.actualCost, estimatedHours: l.estimatedHours, actualHours: l.actualHours, productionRateId: l.productionRateId, confidence: l.confidence, aiExtracted: l.aiExtracted, status: l.status, source: fileLink(l.fileId, l.pageIndex) }))} />
        </Card>
        <JobReviewed jobId={jobId} status={job.status} />
      </div>
    </>
  );
}
