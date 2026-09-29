import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { duplicateProject } from "@/app/actions/project";
import { Card } from "@/components/ui";
import { ProjectForm } from "@/components/ProjectForm";

export default async function ProjectOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, company } = await requireCtx();
  const p = (await db.project.findUnique({ where: { id } }))!;
  const [docs, items, confirmed, maps, lines, rfqs, quotes] = await Promise.all([
    db.document.count({ where: { projectId: id, kind: { not: "QUOTE" } } }),
    db.bidItem.count({ where: { projectId: id } }),
    db.bidItem.count({ where: { projectId: id, status: "CONFIRMED" } }),
    db.bidItemAssembly.count({ where: { projectId: id, confirmed: true } }),
    db.materialLine.count({ where: { projectId: id } }),
    db.rfq.count({ where: { projectId: id, superseded: false } }),
    db.quote.count({ where: { projectId: id, status: "CONFIRMED" } }),
  ]);
  const steps = [
    { done: docs > 0, label: "Upload the bid package", detail: `${docs} document${docs === 1 ? "" : "s"}`, href: "documents" },
    { done: items > 0, label: "Get bid items & quantities", detail: `${items} bid items`, href: "bid-items" },
    { done: items > 0 && confirmed === items, label: "Review every quantity", detail: `${confirmed} of ${items} confirmed`, href: "review" },
    { done: maps > 0, label: "Map bid items to assemblies", detail: `${maps} confirmed mappings`, href: "estimate" },
    { done: lines > 0, label: "Build the material list", detail: `${lines} lines`, href: "materials" },
    { done: rfqs > 0, label: "Send or download RFQs", detail: `${rfqs} current RFQs`, href: "rfqs" },
    { done: quotes > 0, label: "Bring in supplier quotes", detail: `${quotes} confirmed quotes`, href: "quotes" },
    { done: false, label: "Produce bid documents", detail: "Bid summary, bid form, Excel", href: "output" },
  ];
  const pct = (v: number | null, def: number | null) => (v != null ? undefined : def != null ? `Company default: ${def}%` : "No company default set");
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card title="Workflow" className="lg:col-span-1">
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={i}>
              <Link href={`/projects/${id}/${s.href}`} className="flex items-start gap-3 rounded-lg p-2 hover:bg-paper">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.done ? "bg-ok text-white" : "bg-mist text-navy-800"}`}>{s.done ? "✓" : i + 1}</span>
                <span><span className="font-semibold">{s.label}</span><br /><span className="text-xs text-muted">{s.detail}</span></span>
              </Link>
            </li>
          ))}
        </ol>
        <form action={duplicateProject.bind(null, id)} className="mt-4 border-t border-line pt-4"><button className="btn btn-secondary btn-sm">Duplicate this bid</button></form>
      </Card>
      <div className="space-y-6 lg:col-span-2">
        <Card title="Project info">
          <ProjectForm projectId={id} values={JSON.parse(JSON.stringify(p))} fields={[
            { key: "name", label: "Project name", span: true },
            { key: "owner", label: "Owner" },
            { key: "ownerType", label: "Owner type", type: "select", options: [["FEDERAL", "Federal"], ["STATE_DOT", "State DOT"], ["COUNTY_CITY", "County / City"], ["PRIVATE", "Private developer"]] },
            { key: "projectNumber", label: "Owner project number" },
            { key: "location", label: "Location" },
            { key: "bidDueAt", label: "Bid due", type: "datetime" },
            { key: "preBidMeeting", label: "Pre-bid meeting", placeholder: "Date, place, mandatory?" },
            { key: "quoteDueAt", label: "Supplier quotes due", type: "datetime" },
            { key: "deliveryLocation", label: "Material delivery location" },
          ]} />
        </Card>
        <Card title="Job setup">
          <ProjectForm projectId={id} values={JSON.parse(JSON.stringify(p))} fields={[
            { key: "laborMode", label: "Labor mode", type: "select", options: [["OPEN", "Open shop (base wages)"], ["PREVAILING", "Prevailing wage / Davis-Bacon"]] },
            { key: "haulMiles", label: "One-way haul distance", type: "number", suffix: "miles" },
            { key: "markupPct", label: "Markup for this job", type: "number", suffix: "%", help: pct(p.markupPct, company.defaultMarkupPct) },
            { key: "overheadPct", label: "Overhead for this job", type: "number", suffix: "%", help: pct(p.overheadPct, company.overheadPct) },
            { key: "taxPct", label: "Sales tax on materials", type: "number", suffix: "%", help: pct(p.taxPct, company.salesTaxPct) },
            { key: "bondPct", label: "Bond", type: "number", suffix: "%", help: pct(p.bondPct, company.bondingPct) },
            { key: "permitsCost", label: "Permits & fees", type: "number", suffix: "$" },
            { key: "notes", label: "Notes", type: "textarea", span: true },
          ]} />
        </Card>
      </div>
    </div>
  );
}
