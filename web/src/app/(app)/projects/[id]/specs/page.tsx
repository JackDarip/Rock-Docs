import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { Card, EmptyState, ButtonLink } from "@/components/ui";
import { RunSpecs, ReqRow, AddRequirement } from "@/components/Specs";
import { AutoRefresh } from "@/components/AutoRefresh";
import { aiEnabled, estimateAiCost } from "@/lib/ai";
import { sectionCovered } from "@/lib/specs";

export default async function Specs({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireCtx();
  const [items, reqs, docs, running] = await Promise.all([
    db.bidItem.findMany({ where: { projectId: id }, orderBy: { sortOrder: "asc" } }),
    db.specRequirement.findMany({ where: { projectId: id, status: { not: "REJECTED" } }, orderBy: { createdAt: "asc" } }),
    db.document.findMany({ where: { projectId: id }, select: { id: true, filename: true, kind: true, specSections: true, pageCount: true } }),
    db.job.count({ where: { type: "EXTRACT_SPECS", status: { in: ["QUEUED", "RUNNING"] } } }),
  ]);
  const specDocs = docs.filter((d) => d.kind === "SPECS");
  const indexed = specDocs.map((d) => d.specSections);
  const itemList = items.map((b) => ({ id: b.id, itemNumber: b.itemNumber, description: b.description }));
  const pages = specDocs.reduce((n, d) => n + Math.min(60, d.pageCount ?? 30), 0);
  const cost = estimateAiCost(pages);
  const docName = (docId: string | null) => docs.find((d) => d.id === docId)?.filename ?? null;
  const row = (r: (typeof reqs)[number]) => ({ id: r.id, bidItemId: r.bidItemId, material: r.material, requirement: r.requirement, status: r.status, confidence: r.confidence, specSection: r.specSection, source: r.source, page: r.pageIndex != null && r.documentId ? `${docName(r.documentId)} p.${r.pageIndex + 1}` : null });
  const missing = reqs.filter((r) => r.missingStandard);
  if (!items.length) return <EmptyState title="No bid items yet" body="Spec requirements attach to bid items. Add the bid schedule first." actions={<ButtonLink href={`/projects/${id}/bid-items`}>Go to bid items</ButtonLink>} />;
  return (
    <div className="space-y-6">
      <AutoRefresh active={running > 0} ms={4000} />
      <Card title="Material requirements from the specifications">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <p className="max-w-2xl text-sm text-muted">Confirmed requirements are added to the material list, so every RFQ tells suppliers exactly what to quote: gradation, pipe class, binder grade, concrete strength and the section they come from.</p>
          <RunSpecs projectId={id} disabled={!specDocs.length || !aiEnabled() || running > 0}
            note={!specDocs.length ? "Upload the project specifications in the Plan room first." : !aiEnabled() ? "AI reading isn't switched on for this server." : running ? "Reading now…" : `About ${pages} pages · ~$${cost.usd} · ~${Math.ceil(cost.seconds / 60)} min`} />
        </div>
      </Card>
      {missing.length > 0 && (
        <div className="rounded-xl border border-warn-line bg-warn-bg p-3 text-sm text-warn">
          <div className="font-semibold">⚠ Standard specifications cited but not uploaded</div>
          <ul className="mt-1 list-disc pl-5">{missing.map((m) => <li key={m.id}>{m.standardRef}{m.bidItemId ? ` (item ${items.find((b) => b.id === m.bidItemId)?.itemNumber})` : ""}{m.requirement && !m.requirement.startsWith("Cites") ? `: ${m.requirement}` : ""}</li>)}</ul>
          <p className="mt-1">Upload them in the <Link className="underline" href={`/projects/${id}/documents`}>Plan room</Link>, or type the requirement below.</p>
        </div>
      )}
      <Card title="By bid item">
        <div className="divide-y divide-line">
          {items.map((b) => {
            const mine = reqs.filter((r) => r.bidItemId === b.id && !r.missingStandard);
            const uncovered = specDocs.length > 0 && !sectionCovered(b.specSection, indexed);
            return (
              <div key={b.id} className="grid gap-3 py-3 md:grid-cols-[18rem_1fr]">
                <div>
                  <div className="font-semibold"><span className="font-mono text-xs text-muted">{b.itemNumber}</span> {b.description}</div>
                  <div className="text-xs text-muted">{b.specSection ? `Spec section ${b.specSection}` : "No spec section on the bid schedule"}</div>
                  {b.specSection && !specDocs.length && <div className="mt-1 text-xs text-warn">⚠ No specifications uploaded</div>}
                  {uncovered && <div className="mt-1 text-xs text-warn">⚠ Section {b.specSection} isn&apos;t in the uploaded specs (likely a standard spec)</div>}
                </div>
                <div>{mine.length ? <ul className="space-y-1.5">{mine.map((r) => <ReqRow key={r.id} r={row(r)} items={itemList} />)}</ul> : <p className="text-sm text-faint">No requirements yet.</p>}</div>
              </div>
            );
          })}
        </div>
        {reqs.some((r) => !r.bidItemId && !r.missingStandard) && (
          <div className="mt-4">
            <div className="label">Not tied to a bid item yet</div>
            <ul className="space-y-1.5">{reqs.filter((r) => !r.bidItemId && !r.missingStandard).map((r) => <ReqRow key={r.id} r={row(r)} items={itemList} />)}</ul>
          </div>
        )}
      </Card>
      <Card title="Add a requirement by hand">
        <AddRequirement projectId={id} items={itemList} />
      </Card>
    </div>
  );
}
