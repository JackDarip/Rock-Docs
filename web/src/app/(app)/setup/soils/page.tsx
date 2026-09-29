import { requireCtx } from "@/lib/auth";
import { PageHeader, Card, Term } from "@/components/ui";
import { EditableTable } from "@/components/EditableTable";
import { StepNav } from "@/components/StepNav";
import { SwellVisual } from "@/components/SwellVisual";
import { addStarterSoils } from "@/app/actions/setup";

export default async function SoilsStep() {
  const { db, isAdmin } = await requireCtx();
  const rows = await db.soilType.findMany({ orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader eyebrow="Step 7 of 9" title="Soil & material behavior"
        subtitle={<>Dirt changes volume. <Term k="swell">Swell</Term> is how much bigger it gets in the truck; <Term k="shrink">shrink</Term> is how much smaller it gets once compacted. These convert <Term k="bankcy">bank CY</Term> into haul loads and fill.</>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <EditableTable entity="soilType" readOnly={!isAdmin} rows={rows} addLabel="Add soil type"
            emptyHint="No soil types yet."
            flagRow={{ key: "verified", equals: false, label: "Not verified" }}
            columns={[
              { key: "name", label: "Soil type", required: true, width: "26%" },
              { key: "swellPct", label: "Swell", type: "pct", term: "swell" },
              { key: "shrinkPct", label: "Shrink", type: "pct", term: "shrink" },
              { key: "verified", label: "Verified", type: "checkbox" },
              { key: "notes", label: "Notes" },
            ]} />
          {isAdmin && rows.length === 0 && (
            <form action={addStarterSoils} className="mt-3">
              <button className="btn btn-secondary btn-sm">Start from textbook values (marked unverified)</button>
            </form>
          )}
        </Card>
        <Card title="What 100 bank CY becomes">
          <SwellVisual soils={rows.map((r) => ({ name: r.name, swellPct: r.swellPct, shrinkPct: r.shrinkPct }))} />
        </Card>
      </div>
      <StepNav current="soils" />
    </>
  );
}
