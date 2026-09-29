import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { ProjectTabs } from "@/components/ProjectTabs";
import { fmtDateTime } from "@/components/ui";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireCtx();
  const p = await db.project.findUnique({ where: { id } });
  if (!p) notFound();
  const [drafts, unmapped, quotesToReview] = await Promise.all([
    db.bidItem.count({ where: { projectId: id, status: "DRAFT" } }),
    db.bidItem.count({ where: { projectId: id, NOT: { id: { in: (await db.bidItemAssembly.findMany({ where: { projectId: id }, select: { bidItemId: true } })).map((m) => m.bidItemId) } } } }),
    db.quote.count({ where: { projectId: id, status: "REVIEW" } }),
  ]);
  return (
    <>
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-brand">Job {p.jobNumber}{p.owner ? ` · ${p.owner}` : ""}</div>
        <h1 className="text-3xl font-bold text-night">{p.name}</h1>
        <div className="text-sm text-muted">Bid due {fmtDateTime(p.bidDueAt)} · {p.laborMode === "PREVAILING" ? "Prevailing wage" : "Open shop"}</div>
      </div>
      <ProjectTabs id={id} badges={{ review: drafts, estimate: unmapped, quotes: quotesToReview }} />
      {children}
    </>
  );
}
