import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { EmptyState, ButtonLink } from "@/components/ui";
import { PlanViewer } from "@/components/PlanViewer";

export default async function Viewer({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string; page?: string; markup?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { db } = await requireCtx();
  const focus = sp.markup ? await db.takeoffMarkup.findFirst({ where: { id: sp.markup, projectId: id } }) : null;
  const pdfs = await db.document.findMany({ where: { projectId: id, mime: "application/pdf" }, orderBy: { createdAt: "asc" } });
  const doc = pdfs.find((d) => d.id === (focus?.documentId ?? sp.doc)) ?? pdfs.find((d) => d.kind === "PLANS") ?? pdfs[0];
  if (!doc) return <EmptyState title="No PDFs to view" body="Upload the plan set in the Plan room first." actions={<ButtonLink href={`/projects/${id}/documents`}>Go to Plan room</ButtonLink>} />;
  const [sheets, bidItems, markups] = await Promise.all([
    db.sheet.findMany({ where: { documentId: doc.id }, orderBy: { pageIndex: "asc" } }),
    db.bidItem.findMany({ where: { projectId: id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.takeoffMarkup.findMany({ where: { projectId: id, documentId: doc.id } }),
  ]);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Document:</span>
        {pdfs.map((d) => <Link key={d.id} href={`/projects/${id}/viewer?doc=${d.id}`} className={`rounded-full border px-3 py-0.5 ${d.id === doc.id ? "border-brand bg-brand-50" : "border-line"}`}>{d.filename}</Link>)}
      </div>
      <PlanViewer projectId={id}
        doc={{ id: doc.id, filename: doc.filename, pageCount: doc.pageCount }}
        sheets={sheets.map((s) => ({ pageIndex: s.pageIndex, sheetNumber: s.sheetNumber, title: s.title, feetPerUnit: s.feetPerUnit, scaleText: s.scaleText }))}
        bidItems={bidItems.map((b) => ({ id: b.id, itemNumber: b.itemNumber, description: b.description, unit: b.unit }))}
        markups={JSON.parse(JSON.stringify(markups))}
        initialPage={focus ? focus.pageIndex + 1 : Math.max(1, Number(sp.page) || 1)}
        focusMarkupId={focus?.id ?? null} />
    </div>
  );
}
