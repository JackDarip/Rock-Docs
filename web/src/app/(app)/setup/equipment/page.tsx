import { requireCtx } from "@/lib/auth";
import { PageHeader, Card, Term } from "@/components/ui";
import { EditableTable } from "@/components/EditableTable";
import { StepNav } from "@/components/StepNav";
import { SetupImport } from "@/components/SetupImport";
import { AutoRefresh } from "@/components/AutoRefresh";
import { aiEnabled } from "@/lib/ai";

export default async function EquipmentStep() {
  const { db, isAdmin } = await requireCtx();
  const [rows, drafts] = await Promise.all([
    db.equipment.findMany({ orderBy: { name: "asc" } }),
    db.importDraft.findMany({ where: { kind: "EQUIPMENT", status: { not: "DONE" } }, orderBy: { createdAt: "asc" } }),
  ]);
  return (
    <>
      <PageHeader eyebrow="Step 3 of 9" title="Equipment"
        subtitle={<>List each machine (or class of machine) with its hourly <Term k="ownership">ownership</Term> and <Term k="operating">operating</Term> cost. Pull these from your equipment cost report or accountant.</>} />
      <Card>
        <EditableTable entity="equipment" readOnly={!isAdmin} rows={rows} addLabel="Add machine"
          emptyHint="No equipment yet. Add excavators, dozers, loaders, rollers, trucks…"
          flagRow={{ key: "operatingHourly", equals: null, label: "Missing cost" }}
          columns={[
            { key: "name", label: "Machine", required: true, placeholder: "e.g. CAT 336 excavator", width: "22%" },
            { key: "type", label: "Type", placeholder: "Excavator" },
            { key: "ownershipHourly", label: "Ownership /hr", type: "money", term: "ownership" },
            { key: "operatingHourly", label: "Operating /hr", type: "money", term: "operating" },
            { key: "standbyHourly", label: "Standby /hr", type: "money", term: "standby" },
            { key: "mobilizationCost", label: "Move cost", type: "money", term: "mobilization" },
            { key: "notes", label: "Notes" },
          ]} />
      </Card>
      <Card title="Import from an equipment cost report" className="mt-6">
        <AutoRefresh active={drafts.some((d) => d.status === "PROCESSING")} ms={4000} />
        <p className="mb-3 text-sm text-muted">Upload your internal equipment cost report or a rate sheet. The AI reads each machine&apos;s hourly costs; you tick the rows to add.</p>
        <SetupImport kind="EQUIPMENT" readOnly={!isAdmin} aiOn={aiEnabled()} roles={[]} drafts={drafts.map((d) => ({ id: d.id, filename: d.filename, status: d.status, statusDetail: d.statusDetail, meta: d.meta, rows: d.rows as any[] }))} />
      </Card>
      <StepNav current="equipment" />
    </>
  );
}
