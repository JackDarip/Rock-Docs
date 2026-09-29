import { requireCtx } from "@/lib/auth";
import { PageHeader, Card, Term } from "@/components/ui";
import { EditableTable } from "@/components/EditableTable";
import { StepNav } from "@/components/StepNav";

export default async function EquipmentStep() {
  const { db, isAdmin } = await requireCtx();
  const rows = await db.equipment.findMany({ orderBy: { name: "asc" } });
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
      <StepNav current="equipment" />
    </>
  );
}
