import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { Card, EmptyState, Flag, fmtDateTime } from "@/components/ui";
import { Uploader } from "@/components/Uploader";
import { AutoRefresh } from "@/components/AutoRefresh";
import { DocKind, AckAddendum, DeleteDoc, ExtractSchedule } from "@/components/DocActions";
import { SheetIndex } from "@/components/SheetIndex";

const mb = (n: number) => `${(n / 1048576).toFixed(n > 1048576 * 10 ? 0 : 1)} MB`;

export default async function Documents({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, company } = await requireCtx();
  const [docs, sheets, jobs] = await Promise.all([
    db.document.findMany({ where: { projectId: id, id: { notIn: (await db.quote.findMany({ where: { projectId: id, documentId: { not: null } }, select: { documentId: true } })).map((q) => q.documentId!) } }, orderBy: { createdAt: "asc" } }),
    db.sheet.findMany({ where: { projectId: id }, orderBy: [{ documentId: "asc" }, { pageIndex: "asc" }] }),
    db.job.findMany({ where: { status: { in: ["QUEUED", "RUNNING", "FAILED"] }, createdAt: { gte: new Date(Date.now() - 864e5) } }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const docIds = new Set(docs.map((d) => d.id));
  const myJobs = jobs.filter((j) => docIds.has((j.payload as any)?.documentId));
  const busy = docs.some((d) => d.status === "UPLOADED" || d.status === "PROCESSING") || myJobs.some((j) => j.status !== "FAILED");
  const planDocs = docs.filter((d) => d.kind === "PLANS" || d.kind === "ADDENDUM");
  const addenda = docs.filter((d) => d.kind === "ADDENDUM");
  return (
    <div className="space-y-6">
      <AutoRefresh active={busy} />
      <Uploader projectId={id} />
      {myJobs.length > 0 && (
        <Card title="Background processing">
          <ul className="space-y-1 text-sm">
            {myJobs.map((j) => (
              <li key={j.id} className="flex items-center gap-3">
                <span className="w-44 font-semibold">{j.type === "PROCESS_DOCUMENT" ? "Reading pages" : j.type === "EXTRACT_BID_SCHEDULE" ? "Extracting bid schedule" : "Reading quote"}</span>
                <span className="h-1.5 w-40 overflow-hidden rounded bg-mist"><span className="block h-full bg-brand" style={{ width: `${j.progress}%` }} /></span>
                <span className={j.status === "FAILED" ? "text-warn" : "text-muted"}>{j.status === "FAILED" ? `⚠ ${j.error}` : j.status === "QUEUED" && j.attempts > 0 ? `Retrying (${j.error})` : j.status.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="Bid package">
        {docs.length === 0 ? (
          <EmptyState title="Nothing uploaded yet" body="Upload the documents the owner issued. TrueGrade splits the plan set into sheets, reads title blocks, and suggests what each file is for you to confirm." />
        ) : (
          <table className="tbl">
            <thead><tr><th>File</th><th>What it is</th><th>Pages</th><th>Status</th><th>Uploaded</th><th /></tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td><a className="font-semibold text-navy-700 hover:underline" href={`/api/files/${d.id}`}>{d.filename}</a><div className="text-xs text-muted">{mb(d.size)}{d.scanStatus === "NOT_SCANNED" ? " · virus scan not configured" : ""}</div></td>
                  <td><DocKind id={d.id} kind={d.kind} confirmed={d.kindConfirmed} suggested={d.suggestedKind} addendumNumber={d.addendumNumber} />{d.kind === "ADDENDUM" && <AckAddendum id={d.id} acknowledged={d.acknowledged} />}</td>
                  <td>{d.pageCount ?? "—"}</td>
                  <td className="max-w-64 text-xs">
                    {d.status === "READY" ? (d.hasText === false ? <Flag tone="warn">Scanned</Flag> : <Flag tone="ok">Ready</Flag>) : d.status === "FAILED" ? <Flag tone="warn">Failed</Flag> : <Flag tone="info">{d.status.toLowerCase()}</Flag>}
                    <div className="mt-0.5 text-muted">{d.statusDetail}</div>
                  </td>
                  <td className="text-xs text-muted">{fmtDateTime(d.createdAt)}</td>
                  <td className="space-y-1 whitespace-nowrap text-right">
                    {d.mime === "application/pdf" && d.status === "READY" && <Link className="btn btn-secondary btn-sm" href={`/projects/${id}/viewer?doc=${d.id}`}>Open sheets</Link>}
                    {d.mime === "application/pdf" && d.status === "READY" && (d.kind === "BID_SCHEDULE" || d.kind === "PLANS" || d.kind === "ADDENDUM") && <div className="relative inline-block"><ExtractSchedule id={d.id} pageCount={d.pageCount} /></div>}
                    {d.kind === "QUOTE" && <div><Link className="whitespace-nowrap text-xs text-navy-700 hover:underline" href={`/projects/${id}/quotes`}>Add it under Quotes →</Link></div>}
                    <div><DeleteDoc id={d.id} name={d.filename} /></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {addenda.length > 0 && (
          <p className="mt-3 text-sm text-muted">Addenda: {addenda.map((a) => `#${a.addendumNumber ?? "?"} ${a.acknowledged ? "✓ acknowledged" : "not yet acknowledged"}`).join(" · ")}. Automatic before/after diffing of addenda is on the roadmap; for now, update affected bid items and regenerate RFQs (they revise automatically).</p>
        )}
      </Card>
      {planDocs.length > 0 && (
        <Card title="Sheet index">
          <SheetIndex projectId={id} sheets={JSON.parse(JSON.stringify(sheets.filter((s) => planDocs.some((d) => d.id === s.documentId))))} docs={planDocs.map((d) => ({ id: d.id, filename: d.filename }))} />
        </Card>
      )}
      <p className="text-xs text-muted">AI processing this month is limited to ${company.aiMonthlyLimitUsd} for your company (Admins can change it in Company Setup).</p>
    </div>
  );
}
