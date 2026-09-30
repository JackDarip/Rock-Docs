import { requireCtx } from "@/lib/auth";
import { PageHeader, Card, Term } from "@/components/ui";
import { EditableTable } from "@/components/EditableTable";
import { StepNav } from "@/components/StepNav";
import { SetupImport } from "@/components/SetupImport";
import { AutoRefresh } from "@/components/AutoRefresh";
import { aiEnabled } from "@/lib/ai";

export default async function LaborStep() {
  const { db, isAdmin } = await requireCtx();
  const [roles, pw, drafts] = await Promise.all([
    db.laborRole.findMany({ orderBy: { name: "asc" } }),
    db.prevailingWageRate.findMany({ orderBy: [{ county: "asc" }, { classification: "asc" }] }),
    db.importDraft.findMany({ where: { kind: "WAGES", status: { not: "DONE" } }, orderBy: { createdAt: "asc" } }),
  ]);
  return (
    <>
      <PageHeader eyebrow="Step 2 of 9" title="Labor"
        subtitle={<>Add each crew role you put on a job. Enter the base wage you pay, your <Term k="burden">burden %</Term>, and the <Term k="prevailing">prevailing wage</Term> you use on public jobs. Bids switch between open shop and prevailing wage per job.</>} />
      <Card title="Crew roles" className="mb-6">
        <EditableTable entity="laborRole" readOnly={!isAdmin} rows={roles} addLabel="Add role"
          emptyHint="No roles yet. Add operator, laborer, foreman, pipe layer, flagger…"
          flagRow={{ key: "baseWage", equals: null, label: "No wage" }}
          columns={[
            { key: "name", label: "Role", required: true, placeholder: "e.g. Operator", width: "22%" },
            { key: "baseWage", label: "Base wage /hr", type: "money" },
            { key: "burdenPct", label: "Burden", type: "pct", term: "burden" },
            { key: "prevailingWage", label: "Prevailing base /hr", type: "money", term: "prevailing" },
            { key: "prevailingFringe", label: "Fringe /hr", type: "money", term: "fringe" },
            { key: "notes", label: "Notes" },
          ]} />
      </Card>
      <Card title="Prevailing wage by county / project">
        <AutoRefresh active={drafts.some((d) => d.status === "PROCESSING")} ms={4000} />
        <p className="mb-3 text-sm text-muted">Optional detail from wage determinations. Type rates in, or upload the wage determination PDF: the AI reads every classification and you check each one before it&apos;s added.</p>
        <div className="mb-4"><SetupImport kind="WAGES" readOnly={!isAdmin} aiOn={aiEnabled()} roles={roles.map((r) => ({ id: r.id, name: r.name }))} drafts={drafts.map((d) => ({ id: d.id, filename: d.filename, status: d.status, statusDetail: d.statusDetail, meta: d.meta, rows: d.rows as any[] }))} /></div>
        <EditableTable entity="prevailingWageRate" readOnly={!isAdmin} rows={pw} addLabel="Add rate"
          columns={[
            { key: "county", label: "County", required: true },
            { key: "classification", label: "Classification", required: true, placeholder: "e.g. Power equipment operator Group 3" },
            { key: "laborRoleId", label: "Your role", type: "select", options: roles.map((r) => ({ value: r.id, label: r.name })) },
            { key: "baseRate", label: "Base /hr", type: "money" },
            { key: "fringe", label: "Fringe /hr", type: "money" },
            { key: "projectRef", label: "Project / WD #" },
            { key: "source", label: "Source" },
          ]} />
      </Card>
      <StepNav current="labor" />
    </>
  );
}
