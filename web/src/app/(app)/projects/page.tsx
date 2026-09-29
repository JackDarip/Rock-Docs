import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { PageHeader, Card, EmptyState, ButtonLink, fmtDateTime } from "@/components/ui";

const OWNER_TYPES: Record<string, string> = { FEDERAL: "Federal", STATE_DOT: "State DOT", COUNTY_CITY: "County / City", PRIVATE: "Private" };

export default async function Projects() {
  const { db } = await requireCtx();
  const projects = await db.project.findMany({ orderBy: [{ status: "asc" }, { bidDueAt: "asc" }] });
  return (
    <>
      <PageHeader title="Bids" subtitle="Every bid keeps its own bid package, takeoff, estimate, RFQs and quotes." actions={<ButtonLink href="/projects/new">+ New bid</ButtonLink>} />
      <Card>
        {projects.length === 0 ? (
          <EmptyState title="No bids yet" body="Create a bid, then upload the plan set, bid schedule, specs and addenda the owner issued." actions={<ButtonLink href="/projects/new">Start a bid</ButtonLink>} />
        ) : (
          <table className="tbl">
            <thead><tr><th>Job #</th><th>Project</th><th>Owner</th><th>Type</th><th>Bid due</th><th>Status</th></tr></thead>
            <tbody>{projects.map((p) => (
              <tr key={p.id}>
                <td className="font-mono text-xs">{p.jobNumber}</td>
                <td><Link className="font-semibold text-navy-700 hover:underline" href={`/projects/${p.id}`}>{p.name}</Link></td>
                <td>{p.owner ?? "—"}</td><td>{OWNER_TYPES[p.ownerType ?? ""] ?? "—"}</td>
                <td>{fmtDateTime(p.bidDueAt)}</td><td>{p.status.toLowerCase()}</td>
              </tr>))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
