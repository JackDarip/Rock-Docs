import { headers } from "next/headers";
import { requireCtx } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { currentRfqLines, hashLines } from "@/lib/rfq";
import { categoryNames, fillTemplate, rfqLines } from "@/lib/rfqdata";
import { EmptyState, ButtonLink, fmtDateTime } from "@/components/ui";
import { GenerateRfqs } from "@/components/RebuildButton";
import { RfqCard } from "@/components/RfqCard";
import { Icon } from "@/components/Icon";

export default async function Rfqs({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, company, user } = await requireCtx();
  const h = await headers();
  const baseUrl = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const [project, rfqs, suppliers, cats, lineCount] = await Promise.all([
    db.project.findUniqueOrThrow({ where: { id } }),
    db.rfq.findMany({ where: { projectId: id, superseded: false }, orderBy: { categoryCode: "asc" } }),
    db.supplier.findMany({ where: { kind: "SUPPLIER" }, include: { contacts: true }, orderBy: [{ preferred: "desc" }, { name: "asc" }] }),
    categoryNames(db),
    db.materialLine.count({ where: { projectId: id, excluded: false } }),
  ]);
  const ids = rfqs.map((r) => r.id);
  const [recipients, downloads] = await Promise.all([
    db.rfqRecipient.findMany({ where: { rfqId: { in: ids } }, orderBy: { sentAt: "asc" } }),
    db.rfqDownload.findMany({ where: { rfqId: { in: ids } }, orderBy: { createdAt: "desc" } }),
  ]);
  const users = await prisma.user.findMany({ where: { companyId: company.id }, select: { id: true, name: true } });
  const estimator = users.find((u) => u.id === project.estimatorId)?.name ?? user.name;
  const due = project.quoteDueAt ? fmtDateTime(project.quoteDueAt) : "the date in the RFQ";
  const all = await currentRfqLines(db, id, "ALL");
  const byCat = await db.materialLine.findMany({ where: { projectId: id }, select: { id: true, categoryCode: true } });
  const catOf = new Map(byCat.map((l) => [l.id, l.categoryCode ?? "MISC"]));

  // In-app reminders for RFQs sent outside the app: nudge the estimator, not the supplier.
  const soon = project.quoteDueAt && project.quoteDueAt.getTime() - Date.now() < 24 * 36e5;
  const waiting = soon ? recipients.filter((r) => r.status === "SENT") : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-3xl text-sm text-muted">One RFQ per supplier category plus a combined master. Every RFQ has a unique number that&apos;s in the file name, the spreadsheet, and the email subject, so returned files match the right job, category and revision automatically.</p>
        <div className="flex gap-2"><GenerateRfqs projectId={id} />{rfqs.length > 0 && <a className="btn btn-secondary btn-sm" href={`/api/projects/${id}/rfqs-zip`}><Icon name="download" size={15} />Download all (.zip)</a>}</div>
      </div>
      {!project.quoteDueAt && <div className="rounded-lg border border-mist bg-white p-2 text-sm text-muted">Tip: set &quot;Supplier quotes due&quot; on the bid&apos;s Overview page so it prints on every RFQ.</div>}
      {waiting.length > 0 && (
        <div className="rounded-xl border border-warn-line bg-warn-bg p-3 text-sm text-warn">
          {waiting.map((r) => {
            const rfq = rfqs.find((x) => x.id === r.rfqId)!;
            return <div key={r.id}>⚠ {cats.get(rfq.categoryCode)} quote from {r.name} is due {fmtDateTime(project.quoteDueAt)} and hasn&apos;t been logged.</div>;
          })}
        </div>
      )}
      {rfqs.length === 0 ? (
        <EmptyState title="No RFQs yet" body={lineCount ? "Your material list is ready. Generate RFQs to get supplier-ready spreadsheets." : "Build the material list first; RFQs are generated from it."}
          actions={lineCount ? <GenerateRfqs projectId={id} /> : <ButtonLink href={`/projects/${id}/materials`}>Go to material list</ButtonLink>} />
      ) : rfqs.map((rfq) => {
        const current = rfq.categoryCode === "ALL" ? all : all.filter((l) => catOf.get(l.lineId) === rfq.categoryCode);
        const dls = downloads.filter((d) => d.rfqId === rfq.id);
        const vars = { rfq_number: rfq.number, project: project.name, category: cats.get(rfq.categoryCode) ?? rfq.categoryCode, due, estimator };
        return (
          <RfqCard key={rfq.id} baseUrl={baseUrl} quoteDue={project.quoteDueAt?.toISOString() ?? null}
            rfq={{
              id: rfq.id, number: rfq.number, categoryCode: rfq.categoryCode, categoryName: cats.get(rfq.categoryCode) ?? rfq.categoryCode, revision: rfq.revision,
              lineCount: rfqLines(rfq).length, changedAfterDownload: dls.length > 0 && hashLines(current) !== rfq.contentHash,
              downloads: dls.map((d) => ({ who: users.find((u) => u.id === d.userId)?.name ?? "someone", when: fmtDateTime(d.createdAt), format: d.format, revision: d.revision })),
            }}
            suppliers={suppliers.map((s) => { const c = s.contacts.find((x) => x.isPrimary) ?? s.contacts[0]; return { id: s.id, name: s.name, email: c?.email ?? null, categories: s.categories, preferred: s.preferred, serviceArea: s.serviceArea }; })}
            recipients={recipients.filter((r) => r.rfqId === rfq.id).map((r) => ({ id: r.id, name: r.name, email: r.email, method: r.method, status: r.status, sentAt: r.sentAt.toISOString(), token: r.token, supplierId: r.supplierId }))}
            email={{ subject: fillTemplate(company.rfqSubject ?? "RFQ {rfq_number}: {category} for {project}", vars), body: [fillTemplate(company.rfqBody, vars), fillTemplate(company.rfqSignature, vars)].filter(Boolean).join("\n\n") }} />
        );
      })}
    </div>
  );
}
