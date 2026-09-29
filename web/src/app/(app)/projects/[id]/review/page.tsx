import { requireCtx } from "@/lib/auth";
import { Card, EmptyState, ButtonLink } from "@/components/ui";
import { ReviewTable } from "@/components/ReviewTable";
import { AutoRefresh } from "@/components/AutoRefresh";

export default async function Review({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireCtx();
  const [items, docs, running] = await Promise.all([
    db.bidItem.findMany({ where: { projectId: id }, orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.document.findMany({ where: { projectId: id }, select: { id: true, filename: true } }),
    db.job.count({ where: { type: "EXTRACT_BID_SCHEDULE", status: { in: ["QUEUED", "RUNNING"] } } }),
  ]);
  return (
    <Card title="Mandatory review">
      <AutoRefresh active={running > 0} />
      <p className="mb-4 text-sm text-muted">
        Every extracted, imported, or suggested quantity must be confirmed (or corrected) by a person before it can feed the estimate. Amber rows are low-confidence or missing a quantity. Click a sheet link to check the value against the plans.
        {running > 0 && <strong className="text-navy-700"> AI extraction is running; new drafts will appear here.</strong>}
      </p>
      {items.length === 0 ? (
        <EmptyState title="Nothing to review" body="Quantities land here after you extract a bid schedule, import one, or add bid items." actions={<><ButtonLink href={`/projects/${id}/documents`}>Upload bid documents</ButtonLink><ButtonLink href={`/projects/${id}/bid-items`} variant="secondary">Add bid items manually</ButtonLink></>} />
      ) : (
        <ReviewTable projectId={id} items={JSON.parse(JSON.stringify(items))} docs={Object.fromEntries(docs.map((d) => [d.id, d.filename]))} />
      )}
    </Card>
  );
}
