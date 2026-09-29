import { requireCtx } from "@/lib/auth";
import { createProject } from "@/app/actions/project";
import { PageHeader, Card } from "@/components/ui";

const OWNER_TYPES = [
  { value: "FEDERAL", label: "Federal", setup: "Federal" },
  { value: "STATE_DOT", label: "State DOT", setup: "State DOT" },
  { value: "COUNTY_CITY", label: "County / City", setup: "County / City" },
  { value: "PRIVATE", label: "Private developer", setup: "Commercial / Private" },
];

export default async function NewProject() {
  const { company } = await requireCtx();
  // The project types chosen in Company basics come first; if there's only one, it's preselected.
  const bids = (company.projectTypes ?? []) as string[];
  const types = [...OWNER_TYPES.filter((t) => bids.includes(t.setup)), ...OWNER_TYPES.filter((t) => !bids.includes(t.setup))];
  const preselect = bids.length === 1 ? OWNER_TYPES.find((t) => t.setup === bids[0])?.value : undefined;
  return (
    <>
      <PageHeader title="New bid" subtitle="Just the basics. You can fill in the rest from the bid documents later." />
      <Card className="max-w-3xl">
        <form action={createProject} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><label className="label">Project name *</label><input name="name" required className="input" placeholder="Church Farm Road Pump Station & Pipeline" /></div>
          <div><label className="label">Owner</label><input name="owner" className="input" placeholder="Washington City" /></div>
          <div><label className="label">Owner type</label>
            <select name="ownerType" className="input" defaultValue={preselect ?? ""}>
              <option value="">—</option>
              {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <p className="mt-1 text-xs text-muted">Public owners start the bid on prevailing wage; you can switch it on the bid.</p>
          </div>
          <div><label className="label">Owner project number</label><input name="projectNumber" className="input" /></div>
          <div><label className="label">Location</label><input name="location" className="input" placeholder="Washington, UT" /></div>
          <div><label className="label">Bid due</label><input name="bidDueAt" type="datetime-local" className="input" /></div>
          <div><label className="label">Your job number</label><input name="jobNumber" className="input" placeholder="Auto" /></div>
          <div className="md:col-span-2"><button className="btn btn-primary">Create bid</button></div>
        </form>
      </Card>
    </>
  );
}
