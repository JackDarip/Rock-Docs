import { requireCtx } from "@/lib/auth";
import { createProject } from "@/app/actions/project";
import { PageHeader, Card } from "@/components/ui";

export default async function NewProject() {
  await requireCtx();
  return (
    <>
      <PageHeader title="New bid" subtitle="Just the basics. You can fill in the rest from the bid documents later." />
      <Card className="max-w-3xl">
        <form action={createProject} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><label className="label">Project name *</label><input name="name" required className="input" placeholder="Church Farm Road Pump Station & Pipeline" /></div>
          <div><label className="label">Owner</label><input name="owner" className="input" placeholder="Washington City" /></div>
          <div><label className="label">Owner type</label>
            <select name="ownerType" className="input"><option value="">—</option><option value="FEDERAL">Federal</option><option value="STATE_DOT">State DOT</option><option value="COUNTY_CITY">County / City</option><option value="PRIVATE">Private developer</option></select>
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
