import { requireCtx } from "@/lib/auth";
import { Card, EmptyState, ButtonLink, Term, fmtDateTime } from "@/components/ui";
import { SurfaceTable, EarthworkForm, ManualEarthwork, CutFillMap, CalcActions } from "@/components/Earthwork";
import { balance } from "@/lib/landxml";

const n = (v: number | null | undefined, d = 0) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: d }));

export default async function Earthwork({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireCtx();
  const [surfaces, calcs, soils, docs, ownerItems] = await Promise.all([
    db.surface.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } }),
    db.earthworkCalc.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" } }),
    db.soilType.findMany({ orderBy: { name: "asc" } }),
    db.document.findMany({ where: { projectId: id }, select: { id: true, filename: true } }),
    db.bidItem.findMany({ where: { projectId: id, unit: { in: ["CY", "cy"] }, source: "BID_SCHEDULE" } }),
  ]);
  const file = (docId: string) => docs.find((d) => d.id === docId)?.filename ?? "";
  const surf = surfaces.map((s) => ({ id: s.id, name: s.name, role: s.role, pointCount: s.pointCount, faceCount: s.faceCount, units: s.units, file: file(s.documentId) }));
  const soilList = soils.map((s) => ({ id: s.id, name: s.name, swellPct: s.swellPct, shrinkPct: s.shrinkPct }));
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted">
        Earthwork quantities come from three places only: the owner&apos;s bid schedule, a comparison of LandXML surfaces, or your own takeoff entered with a note saying where it came from. {`They're never estimated from contour lines on a PDF.`} Your <Term k="swell">swell</Term> and <Term k="shrink">shrink</Term> factors from Setup turn cut and fill into haul-off or import.
      </p>

      <Card title="LandXML surfaces">
        {surf.length === 0 ? (
          <EmptyState title="No surfaces yet" body="Upload the existing-ground and finish-grade LandXML files (from Civil 3D, OpenRoads, Trimble Business Center…) in the Plan room. Their surfaces appear here in a minute."
            actions={<ButtonLink href={`/projects/${id}/documents`}>Go to Plan room</ButtonLink>} />
        ) : (
          <div className="space-y-5">
            <SurfaceTable surfaces={surf} />
            {surf.length >= 2 ? <EarthworkForm projectId={id} surfaces={surf} soils={soilList} /> : <p className="text-sm text-muted">Upload a second surface to compare against.</p>}
          </div>
        )}
      </Card>

      <Card title="Enter quantities from your own earthwork takeoff">
        <ManualEarthwork projectId={id} soils={soilList} />
      </Card>

      {calcs.map((c) => {
        const b = balance(c.cutCy, c.fillCy, c.swellPct, c.shrinkPct);
        const owner = ownerItems.find((i) => /excavat|cut|roadway ex/i.test(i.description));
        const variance = owner?.quantity ? ((c.cutCy - owner.quantity) / owner.quantity) * 100 : null;
        return (
          <Card key={c.id} title={<>{c.source === "LANDXML" ? "Surface comparison" : "Manual entry"} <span className="text-sm font-normal text-muted">· {fmtDateTime(c.createdAt)}</span></>} actions={<CalcActions id={c.id} hasExport={b.exportLooseCy > 0} hasImport={b.importBankCy > 0} />}>
            <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
              <div className="space-y-3">
                <p className="text-sm text-muted">{c.note}{c.gridFt ? ` · ${c.gridFt.toFixed(1)} ft grid over ${n((c.areaSf ?? 0) / 43560, 2)} acres` : ""}</p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-lg bg-paper p-3"><div className="text-xs text-muted">Cut (bank)</div><div className="text-2xl font-bold tabular-nums">{n(c.cutCy)} CY</div></div>
                  <div className="rounded-lg bg-paper p-3"><div className="text-xs text-muted">Fill (compacted)</div><div className="text-2xl font-bold tabular-nums">{n(c.fillCy)} CY</div></div>
                  <div className="rounded-lg bg-paper p-3"><div className="text-xs text-muted">{b.exportBankCy > 0 ? "Haul off (loose)" : "Import (bank)"}</div><div className="text-2xl font-bold tabular-nums">{n(b.exportBankCy > 0 ? b.exportLooseCy : b.importBankCy)} CY</div></div>
                  <div className="rounded-lg bg-paper p-3"><div className="text-xs text-muted">Soil factors</div><div className="text-lg font-semibold">{c.swellPct != null || c.shrinkPct != null ? `${c.swellPct ?? 0}% swell / ${c.shrinkPct ?? 0}% shrink` : "None applied"}</div></div>
                </div>
                <details className="text-sm">
                  <summary className="cursor-pointer text-navy-700">How was this calculated?</summary>
                  <ul className="mt-2 space-y-1 text-muted">
                    {c.source === "LANDXML" && <li>Both surfaces were sampled every {c.gridFt?.toFixed(1)} ft where they overlap. At each point, proposed minus existing elevation gives cut (below existing) or fill (above), times the cell area.</li>}
                    <li>Fill of {n(c.fillCy)} CY compacted needs {n(b.bankForFill)} CY of bank material at {c.shrinkPct ?? 0}% shrink ({n(c.fillCy)} ÷ (1 − {(c.shrinkPct ?? 0) / 100})).</li>
                    <li>{b.exportBankCy > 0 ? <>Cut {n(c.cutCy)} − {n(b.bankForFill)} = {n(b.exportBankCy)} CY surplus in place, × (1 + {(c.swellPct ?? 0) / 100}) swell = {n(b.exportLooseCy)} CY loose to haul off.</> : <>{n(b.bankForFill)} − cut {n(c.cutCy)} = {n(b.importBankCy)} CY of borrow to import (bank), about {n(b.importLooseCy)} CY loose in trucks.</>}</li>
                  </ul>
                </details>
                {owner && variance != null && (
                  <p className={`text-sm ${Math.abs(variance) > 5 ? "text-warn" : "text-muted"}`}>{Math.abs(variance) > 5 ? "⚠ " : ""}Owner&apos;s item {owner.itemNumber} ({owner.description}) shows {n(owner.quantity)} CY; this cut differs by {variance > 0 ? "+" : ""}{variance.toFixed(1)}%.</p>
                )}
              </div>
              {c.preview && <CutFillMap preview={c.preview as any} />}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
