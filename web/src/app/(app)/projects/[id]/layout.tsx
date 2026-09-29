import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { ProjectTabs, SectionCrumb } from "@/components/ProjectTabs";
import { fmtDateTime } from "@/components/ui";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireCtx();
  const p = await db.project.findUnique({ where: { id } });
  if (!p) notFound();
  const [drafts, unmapped, quotesToReview, addendaPending] = await Promise.all([
    db.bidItem.count({ where: { projectId: id, status: "DRAFT" } }),
    db.bidItem.count({ where: { projectId: id, NOT: { id: { in: (await db.bidItemAssembly.findMany({ where: { projectId: id }, select: { bidItemId: true } })).map((m) => m.bidItemId) } } } }),
    db.quote.count({ where: { projectId: id, status: "REVIEW" } }),
    db.bidItemChange.count({ where: { projectId: id, status: "PENDING" } }),
  ]);
  return (
    <>
      <div className="mb-4">
        <SectionCrumb id={id} jobNumber={p.jobNumber} />
        <h1 className="mt-1 text-3xl font-bold text-night">{p.name}</h1>
        <div className="text-sm text-muted">{p.bidDueAt ? `Bid due ${fmtDateTime(p.bidDueAt)}` : "Bid due date not set"}{p.owner ? ` · ${p.owner}` : ""} · {p.laborMode === "PREVAILING" ? "Prevailing wage" : "Open shop"}</div>
      </div>
      <div className="mb-6 border-b border-line" />
      <ProjectTabs id={id} name={p.name} badges={{ review: drafts, estimate: unmapped, quotes: quotesToReview, addenda: addendaPending }} />
      {children}
    </>
  );
}
