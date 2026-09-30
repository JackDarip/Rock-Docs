import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { Card, EmptyState, ButtonLink, fmtDateTime } from "@/components/ui";
import { AckAddendum } from "@/components/DocActions";
import { FindChanges, ChangeTable, ReviseRfqs } from "@/components/Addenda";
import { AutoRefresh } from "@/components/AutoRefresh";
import { affectedRfqs, normItem } from "@/lib/addenda";
import { aiEnabled } from "@/lib/ai";

export default async function Addenda({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireCtx();
  const [docs, changes, versions, jobs] = await Promise.all([
    db.document.findMany({ where: { projectId: id }, orderBy: [{ addendumNumber: "asc" }, { createdAt: "asc" }] }),
    db.bidItemChange.findMany({ where: { projectId: id }, orderBy: [{ createdAt: "asc" }] }),
    db.packageVersion.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } }),
    db.job.count({ where: { type: "EXTRACT_ADDENDUM", status: { in: ["QUEUED", "RUNNING"] } } }),
  ]);
  const addenda = docs.filter((d) => d.kind === "ADDENDUM");
  const others = docs.filter((d) => d.kind !== "ADDENDUM");
  const sheets = await db.sheet.findMany({ where: { projectId: id }, select: { id: true, documentId: true, pageIndex: true, sheetNumber: true, title: true } });
  const affected = await affectedRfqs(db, id);
  if (!addenda.length) {
    return <EmptyState title="No addenda yet" body="When the owner issues an addendum, upload it in the Plan room and tag it as Addendum with its number. It shows up here so you can see exactly what changed and accept it into the estimate."
      actions={<ButtonLink href={`/projects/${id}/documents`}>Go to Plan room</ButtonLink>} />;
  }
  return (
    <div className="space-y-6">
      <AutoRefresh active={jobs > 0} ms={4000} />
      {affected.length > 0 && <ReviseRfqs projectId={id} numbers={affected.map((r) => r.number)} />}
      {addenda.map((d) => {
        const mine = changes.filter((c) => c.documentId === d.id);
        const earlier = new Set(sheets.filter((s) => s.documentId !== d.id && others.some((o) => o.id === s.documentId) && s.sheetNumber).map((s) => normItem(s.sheetNumber!)));
        const docSheets = sheets.filter((s) => s.documentId === d.id && s.sheetNumber).sort((a, b) => a.pageIndex - b.pageIndex);
        return (
          <Card key={d.id} title={<>Addendum {d.addendumNumber ?? "(number?)"} <span className="text-sm font-normal text-muted">· {d.filename} · {fmtDateTime(d.createdAt)}</span></>}
            actions={<AckAddendum id={d.id} acknowledged={d.acknowledged} />}>
            <div className="space-y-5">
              {d.addendumNumber == null && <p className="text-sm text-warn">⚠ Set the addendum number in the Plan room so it prints correctly on RFQs and the bid form.</p>}
              {d.statusDetail && <p className="text-sm text-muted">{d.statusDetail}</p>}
              {docSheets.length > 0 && (
                <div>
                  <div className="label">Sheets in this addendum</div>
                  <div className="flex flex-wrap gap-1.5">
                    {docSheets.map((s) => (
                      <Link key={s.id} href={`/projects/${id}/viewer?doc=${d.id}&page=${s.pageIndex + 1}`} className={`rounded-full border px-2 py-0.5 text-xs hover:border-brand ${earlier.has(normItem(s.sheetNumber!)) ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`} title={s.title ?? undefined}>
                        {s.sheetNumber} · {earlier.has(normItem(s.sheetNumber!)) ? "revised" : "new"}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              <FindChanges documentId={d.id} aiOn={aiEnabled()} />
              {mine.length > 0 && <ChangeTable documentId={d.id} changes={mine.map((c) => ({ id: c.id, itemNumber: c.itemNumber, changeType: c.changeType, before: c.before as any, after: c.after as any, status: c.status }))} />}
            </div>
          </Card>
        );
      })}
      {versions.length > 0 && (
        <Card title="Bid package history">
          <ol className="space-y-2 text-sm">
            {versions.map((v) => {
              const s = v.summary as any;
              const items = (v.snapshot as any[]) ?? [];
              return (
                <li key={v.id}>
                  <details>
                    <summary className="cursor-pointer"><strong>{v.label}</strong> <span className="text-muted">· {fmtDateTime(v.createdAt)} · {s.items != null ? `${s.items} bid items` : `${s.added ?? 0} added, ${s.changed ?? 0} changed, ${s.removed ?? 0} removed${s.rejected ? `, ${s.rejected} kept as-is` : ""}`}</span></summary>
                    <table className="tbl mt-2"><thead><tr><th>Item</th><th>Description</th><th className="text-right">Qty</th><th>Unit</th></tr></thead>
                      <tbody>{items.map((b, i) => <tr key={i}><td className="font-mono text-xs">{b.itemNumber}</td><td>{b.description}</td><td className="text-right">{b.quantity?.toLocaleString() ?? "—"}</td><td>{b.unit}</td></tr>)}</tbody></table>
                  </details>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
    </div>
  );
}
