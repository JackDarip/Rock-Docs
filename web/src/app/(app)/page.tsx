import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { setupStatus } from "@/lib/setup";
import { PageHeader, Card, EmptyState, ButtonLink, Stat, fmtDateTime } from "@/components/ui";
import { SetupProgress } from "@/components/SetupProgress";
import { TAGLINE } from "@/config/brand";

export default async function Dashboard() {
  const { db, company } = await requireCtx();
  const [status, projects, drafts] = await Promise.all([
    setupStatus(db, company),
    db.project.findMany({ orderBy: { bidDueAt: "asc" }, where: { status: "BIDDING" }, take: 12 }),
    db.bidItem.count({ where: { status: "DRAFT" } }),
  ]);
  return (
    <>
      <PageHeader eyebrow={company.name} title="Dashboard" subtitle={TAGLINE}
        actions={<ButtonLink href="/projects/new">+ New bid</ButtonLink>} />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Stat label="Setup completeness" value={`${status.score}%`} hint={status.score < 100 ? "Estimates flag any line that relies on missing setup values." : "All setup steps have data."} />
        <Stat label="Open bids" value={projects.length} />
        <Stat label="Quantities awaiting review" value={drafts} hint={drafts ? "AI drafts don't flow into estimates until confirmed." : "Nothing waiting."} />
      </div>
      {status.score < 100 && (
        <Card className="mb-6" title="Make it yours" actions={<ButtonLink href="/setup" variant="secondary">Open Company Setup</ButtonLink>}>
          <p className="mb-4 text-sm text-muted">TrueGrade ships empty on purpose: every number in an estimate comes from your own costs. Finish these at your own pace; each step can be skipped and edited anytime.</p>
          <SetupProgress steps={status.steps} />
        </Card>
      )}
      <Card title="Upcoming bids" actions={<Link href="/projects" className="text-sm font-semibold text-navy-700">All bids →</Link>}>
        {projects.length === 0 ? (
          <EmptyState title="No bids yet" body="Start a bid, upload the owner's plan set and bid schedule, and TrueGrade builds a draft takeoff for you to review."
            actions={<><ButtonLink href="/projects/new">Start a bid</ButtonLink><ButtonLink href="/setup" variant="secondary">Finish setup first</ButtonLink></>} />
        ) : (
          <table className="tbl">
            <thead><tr><th>Job #</th><th>Project</th><th>Owner</th><th>Bid due</th></tr></thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono text-xs">{p.jobNumber}</td>
                  <td><Link className="font-semibold text-navy-700 hover:underline" href={`/projects/${p.id}`}>{p.name}</Link></td>
                  <td>{p.owner ?? "—"}</td>
                  <td>{fmtDateTime(p.bidDueAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
