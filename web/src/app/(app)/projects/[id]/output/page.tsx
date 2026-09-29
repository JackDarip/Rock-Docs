import { requireCtx } from "@/lib/auth";
import { loadEstimate } from "@/lib/estimate";
import { Card, fmtMoney } from "@/components/ui";
import { Icon } from "@/components/Icon";

export default async function Output({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, company } = await requireCtx();
  const est = await loadEstimate(db, company, id);
  if (!est) return null;
  const { result } = est;
  const ready = result.blockers.length === 0 && result.sections.length > 0;
  const addenda = await db.document.findMany({ where: { projectId: id, kind: "ADDENDUM" } });
  const unack = addenda.filter((a) => !a.acknowledged);
  const link = (kind: string) => `/api/projects/${id}/output?kind=${kind}`;
  const items = [
    { kind: "summary-client", title: "Bid summary: client version", body: "Company-branded PDF with bid items, unit prices and total. Hides your internal cost detail.", final: true },
    { kind: "summary-internal", title: "Bid summary: internal version", body: "Every line with labor, equipment, materials, basis, markups, and open issues.", final: false },
    { kind: "bidform-xlsx", title: "Bid form values (Excel)", body: "Unit prices and extensions in the exact order of the owner's bid schedule, ready to transfer to the official form.", final: true },
    { kind: "bidform-pdf", title: "Bid form values (PDF)", body: "Same as above, as a printable PDF.", final: true },
    { kind: "estimate-xlsx", title: "Full estimate (Excel)", body: "Everything, including the plain-English calculation for every line.", final: false },
    { kind: "compare-xlsx", title: "Quote comparison (Excel)", body: "Supplier prices side by side.", final: false },
  ];
  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase text-muted">Total bid</div>
            <div className="font-display text-5xl font-bold">{fmtMoney(result.totals.total)}</div>
            <div className="text-sm text-muted">{result.confidence.pctTrusted}% based on calibrated, verified, or quoted data</div>
          </div>
          {!ready && (
            <div className="max-w-lg rounded-xl border border-warn-line bg-warn-bg p-3 text-sm text-warn">
              ⚠ Final bid documents are held until every bid item is confirmed and mapped ({result.blockers.length} open). Internal drafts are always available.
            </div>
          )}
        </div>
        {unack.length > 0 && <p className="mt-3 text-sm text-warn">⚠ Addenda not yet acknowledged: {unack.map((a) => `#${a.addendumNumber ?? "?"}`).join(", ")} (Plan room).</p>}
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((it) => (
          <div key={it.kind} className="card flex flex-col p-5">
            <div className="text-lg font-bold">{it.title}</div>
            <p className="mt-1 flex-1 text-sm text-muted">{it.body}</p>
            {it.final && !ready ? (
              <button className="btn btn-secondary mt-3" disabled title="Resolve the open bid items first">Blocked: open items</button>
            ) : <a className="btn btn-primary mt-3 justify-center" href={link(it.kind)}><Icon name="download" size={16} />Download</a>}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">Close-out (entering actual job costs to calibrate future estimates) and historical job import are the next build phases.</p>
    </div>
  );
}
