import { Fragment } from "react";
import { requireCtx } from "@/lib/auth";
import { loadEstimate } from "@/lib/estimate";
import type { ValueStatus } from "@/lib/calc";
import { Card, EmptyState, ButtonLink, Flag, Term, fmtMoney, fmtNum, fmtDateTime } from "@/components/ui";
import { AddMapping, MappingControls, OverridePanel, SaveVersion, SuggestButton } from "@/components/EstimateControls";

const STATUS: Record<ValueStatus, { label: string; short: string; tone: "ok" | "info" | "warn" | "muted"; color: string }> = {
  CALIBRATED: { label: "Calibrated", short: "Calibrated", tone: "ok", color: "#047857" },
  QUOTED: { label: "Supplier quote", short: "Quoted", tone: "ok", color: "#059669" },
  VERIFIED: { label: "Verified company value", short: "Verified", tone: "info", color: "#234478" },
  OVERRIDE: { label: "Job override", short: "Override", tone: "info", color: "#FF8A33" },
  UNVERIFIED: { label: "Unverified", short: "Unverified", tone: "warn", color: "#F59E0B" },
};
const DEFAULT_SECTIONS = ["Project Setup", "Earthwork", "Wet Utilities", "Paving & Concrete", "Structures", "Indirect Costs"];

export default async function EstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, company } = await requireCtx();
  const est = await loadEstimate(db, company, id);
  if (!est) return null;
  const { result, setup, mappings, overrides, bidItems } = est;
  const versions = await db.estimateVersion.findMany({ where: { projectId: id }, orderBy: { version: "desc" }, take: 5 });
  if (!bidItems.length) {
    return <EmptyState title="No bid items to estimate" body="The estimate is built from confirmed quantities. Add or extract bid items first." actions={<ButtonLink href={`/projects/${id}/bid-items`}>Go to bid items</ButtonLink>} />;
  }
  const hasOwnerSchedule = bidItems.some((b) => b.source === "BID_SCHEDULE");
  const sections = hasOwnerSchedule ? result.sections : [...result.sections].sort((a, b) => DEFAULT_SECTIONS.indexOf(a.bidItem.section ?? "Indirect Costs") - DEFAULT_SECTIONS.indexOf(b.bidItem.section ?? "Indirect Costs"));
  const t = result.totals;
  const total = Object.values(result.confidence.byStatus).reduce((s, x) => s + x, 0);
  const latest = versions[0];
  const drift = latest && Math.abs(latest.total - t.total) > 0.5;

  const targets = [
    ...setup.laborRoles.map((r) => ({ type: "LABOR_ROLE", id: r.id, name: `Labor: ${r.name}`, fields: [{ key: "baseWage", label: "Base wage", current: r.baseWage }, { key: "burdenPct", label: "Burden %", current: r.burdenPct }, { key: "prevailingWage", label: "Prevailing wage", current: r.prevailingWage }, { key: "prevailingFringe", label: "Fringe", current: r.prevailingFringe }] })),
    ...setup.equipment.map((e) => ({ type: "EQUIPMENT", id: e.id, name: `Equipment: ${e.name}`, fields: [{ key: "ownershipHourly", label: "Ownership /hr", current: e.ownershipHourly }, { key: "operatingHourly", label: "Operating /hr", current: e.operatingHourly }] })),
    ...setup.materials.map((m) => ({ type: "MATERIAL", id: m.id, name: `Material: ${m.name}`, fields: [{ key: "unitCost", label: `Unit cost /${m.unit}`, current: m.unitCost }] })),
    ...setup.productionRates.map((p) => ({ type: "PRODUCTION_RATE", id: p.id, name: `Production: ${p.activity}`, fields: [{ key: "outputPerDay", label: `${p.unit} per day`, current: p.outputPerDay }, { key: "hoursPerDay", label: "Hours per day", current: p.hoursPerDay }] })),
  ];

  let lastSection = "";
  return (
    <div className="est-layout">
      <div className="est-main space-y-4">
        {drift && (
          <div className="rounded-xl border border-warn-line bg-warn-bg p-3 text-sm text-warn">
            ⚠ This estimate has changed since version {latest.version} was saved ({fmtDateTime(latest.createdAt)}): was {fmtMoney(latest.total)}, now {fmtMoney(t.total)}. Company setup, quotes, or quantities changed. The saved version keeps its original values; save a new version to lock in the recalculation.
          </div>
        )}
        {result.blockers.length > 0 && (
          <div className="rounded-xl border border-warn-line bg-warn-bg p-3 text-sm text-warn">
            <strong>⚠ {result.blockers.length} bid item{result.blockers.length > 1 ? "s" : ""} not ready.</strong> Unmapped or unconfirmed items block final bid output.
            <ul className="mt-1 list-disc pl-5">{result.blockers.slice(0, 6).map((b, i) => <li key={i}>{b}</li>)}</ul>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">{hasOwnerSchedule ? "Organized by the owner's bid items, so your bid maps 1:1 to the bid form." : "No owner schedule: grouped into default sections."}</p>
          <SuggestButton projectId={id} />
        </div>
        {sections.map((s) => {
          const header = !hasOwnerSchedule && (s.bidItem.section ?? "Indirect Costs") !== lastSection ? (lastSection = s.bidItem.section ?? "Indirect Costs") : null;
          const maps = mappings.filter((m) => m.bidItemId === s.bidItem.id);
          return (
            <div key={s.bidItem.id}>
              {header && <h3 className="mb-2 mt-4 text-xl font-bold text-navy-800">{header}</h3>}
              <section className={`card p-4 ${s.blocked.length ? "border-warn-line" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-muted">Bid item {s.bidItem.itemNumber}</div>
                    <div className="font-semibold">{s.bidItem.description}</div>
                    <div className="text-sm text-muted">{fmtNum(s.bidItem.quantity, 3)} {s.bidItem.unit}
                      {s.bidItem.status !== "CONFIRMED" && <Flag>Quantity not confirmed</Flag>}
                      {s.bidItem.aiExtracted && s.bidItem.status !== "CONFIRMED" && <Flag>AI draft</Flag>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-2xl font-bold">{fmtMoney(s.direct)}</div>
                    <div className="text-xs text-muted">direct cost{s.bidItem.quantity ? ` · ${fmtMoney(s.direct / s.bidItem.quantity)}/${s.bidItem.unit}` : ""}</div>
                  </div>
                </div>
                {s.lines.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                  <table className="tbl">
                    <thead><tr><th>Assembly</th><th className="text-right">Qty</th><th className="text-right">Labor</th><th className="text-right">Equip.</th><th className="text-right">Materials</th><th className="text-right">Total</th><th>Basis</th></tr></thead>
                    <tbody>
                      {s.lines.map((l) => {
                        const m = maps.find((x) => x.id === l.mappingId)!;
                        return (
                          <Fragment key={l.mappingId}>
                            <tr className={l.status === "UNVERIFIED" ? "row-warn" : ""}>
                              <td className="min-w-[160px] font-semibold">{l.assemblyName}</td>
                              <td className="whitespace-nowrap text-right">{fmtNum(l.qty, 2)} {l.unit}</td>
                              <td className="whitespace-nowrap text-right tabular-nums">{fmtMoney(l.labor)}</td>
                              <td className="whitespace-nowrap text-right tabular-nums">{fmtMoney(l.equipment)}</td>
                              <td className="whitespace-nowrap text-right tabular-nums">{fmtMoney(l.material)}</td>
                              <td className="whitespace-nowrap text-right font-semibold tabular-nums">{fmtMoney(l.total)}</td>
                              <td className="whitespace-nowrap"><Flag tone={STATUS[l.status].tone} title={STATUS[l.status].label}>{STATUS[l.status].short}</Flag></td>
                            </tr>
                            <tr>
                              <td colSpan={7} className="pt-0">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                <details className="min-w-0 flex-1 text-xs">
                                  <summary className="cursor-pointer text-navy-700">How was this calculated?</summary>
                                  <ul className="mt-1 max-w-4xl space-y-0.5 whitespace-pre-wrap text-muted">{l.explain.map((e, i) => <li key={i}>{e}</li>)}</ul>
                                  {l.issues.length > 0 && <ul className="mt-1 text-warn">{l.issues.map((x, i) => <li key={i}>⚠ {x}</li>)}</ul>}
                                  {s.bidItem.documentId && <a className="mt-1 inline-block text-navy-700 underline" href={`/projects/${id}/viewer?doc=${s.bidItem.documentId}&page=${(s.bidItem.pageIndex ?? 0) + 1}`}>Open the source sheet</a>}
                                </details>
                                {m && <MappingControls projectId={id} mappingId={m.id} qtyFactor={m.qtyFactor} confirmed={m.confirmed} aiSuggested={m.aiSuggested} />}
                                </div>
                              </td>
                            </tr>
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                )}
                <div className="mt-3"><AddMapping projectId={id} bidItemId={s.bidItem.id} assemblies={setup.assemblies.map((a) => ({ id: a.id, name: a.name, unit: a.unit }))} /></div>
              </section>
            </div>
          );
        })}
      </div>

      <aside className="est-summary" aria-label="Estimate summary">
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted"><Term k="confidence">Confidence</Term></div>
          <div className="font-display text-4xl font-bold">{result.confidence.pctTrusted}%</div>
          <p className="text-sm text-muted">of this estimate is based on calibrated, verified, or quoted data.</p>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-mist">
            {(Object.keys(STATUS) as ValueStatus[]).map((k) => total > 0 && result.confidence.byStatus[k] > 0 && <div key={k} style={{ width: `${(result.confidence.byStatus[k] / total) * 100}%`, background: STATUS[k].color }} title={STATUS[k].label} />)}
          </div>
          <ul className="mt-2 space-y-0.5 text-xs">
            {(Object.keys(STATUS) as ValueStatus[]).filter((k) => result.confidence.byStatus[k] > 0).map((k) => (
              <li key={k} className="flex justify-between"><span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: STATUS[k].color }} />{STATUS[k].label}</span><span>{fmtMoney(result.confidence.byStatus[k], 0)}</span></li>
            ))}
          </ul>
        </Card>
        <Card>
          <table className="w-full text-sm">
            <tbody>
              {([["Labor", t.labor], ["Equipment", t.equipment], ["Materials", t.material], [`Sales tax (${t.taxPct}%)`, t.materialTax], ["Direct cost", t.direct], [`Overhead (${t.overheadPct}%)`, t.overhead], [`Markup (${t.markupPct}%)`, t.markup], ["Permits & fees", t.permits], [`Bond (${t.bondPct}%)`, t.bond]] as [string, number][]).map(([k, v]) => (
                <tr key={k} className={k === "Direct cost" ? "border-t border-line font-semibold" : ""}><td className="py-0.5 text-muted">{k}</td><td className="py-0.5 text-right">{fmtMoney(v)}</td></tr>
              ))}
              <tr className="border-t-2 border-night"><td className="pt-2 font-display text-xl font-bold">Total bid</td><td className="pt-2 text-right font-display text-xl font-bold">{fmtMoney(t.total)}</td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">Change markup, overhead, tax and bond for this job on the bid&apos;s Overview page.</p>
        </Card>
      </aside>
      <aside className="est-tools" aria-label="Overrides and versions">
        <Card title={<Term k="override">Job overrides</Term>}>
          <OverridePanel projectId={id} targets={targets} overrides={overrides.map((o) => ({ targetType: o.targetType, targetId: o.targetId, field: o.field, value: o.value, reason: o.reason }))} />
        </Card>
        <Card title="Versions">
          <SaveVersion projectId={id} />
          <ul className="mt-3 space-y-1 text-sm">{versions.map((v) => <li key={v.id} className="flex justify-between"><span>v{v.version}{v.label ? ` · ${v.label}` : ""} <span className="text-xs text-muted">{fmtDateTime(v.createdAt)}</span></span><span>{fmtMoney(v.total, 0)}</span></li>)}</ul>
        </Card>
      </aside>
    </div>
  );
}
