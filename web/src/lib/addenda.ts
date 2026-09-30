import type { TenantDb } from "./db";
import { similarity } from "./rfq";
import { hashLines, currentRfqLines } from "./rfq";
import type { ScheduleRow } from "./schedule";

export const normItem = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "").replace(/^0+(?=\d)/, "").replace(/\.$/, "");

type Snap = { itemNumber: string; description: string; unit: string; quantity: number | null; specSection: string | null };
const snap = (b: Snap): Snap => ({ itemNumber: b.itemNumber, description: b.description, unit: b.unit, quantity: b.quantity, specSection: b.specSection });

/** Keep an "Original bid package" version before the first addendum changes anything. */
export async function ensureOriginalVersion(db: TenantDb, projectId: string, userId: string | null) {
  if (await db.packageVersion.count({ where: { projectId } })) return;
  const items = await db.bidItem.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" } });
  await db.packageVersion.create({ data: { projectId, label: "Original bid package", summary: { items: items.length } as any, snapshot: items.map(snap) as any, userId } as any });
}

/** Compare a revised schedule to the current bid items; store each difference as a pending change. */
export async function diffSchedule(db: TenantDb, projectId: string, documentId: string, rows: ScheduleRow[], userId: string | null) {
  await ensureOriginalVersion(db, projectId, userId);
  await db.bidItemChange.deleteMany({ where: { projectId, documentId, status: "PENDING" } });
  const current = await db.bidItem.findMany({ where: { projectId } });
  const byNum = new Map(current.map((b) => [normItem(b.itemNumber), b]));
  const seen = new Set<string>();
  const changes: any[] = [];
  for (const r of rows) {
    const k = normItem(r.itemNumber);
    seen.add(k);
    const b = byNum.get(k);
    if (!b) { changes.push({ projectId, documentId, itemNumber: r.itemNumber, changeType: "ADDED", after: r }); continue; }
    const diffs: string[] = [];
    if ((b.quantity ?? null) !== (r.quantity ?? null) && !(b.quantity != null && r.quantity != null && Math.abs(b.quantity - r.quantity) < 1e-6)) diffs.push("quantity");
    if (b.unit.trim().toUpperCase() !== r.unit.trim().toUpperCase()) diffs.push("unit");
    if (similarity(b.description, r.description) < 0.92 && b.description.trim().toLowerCase() !== r.description.trim().toLowerCase()) diffs.push("description");
    if (r.specSection && (b.specSection ?? "") !== r.specSection) diffs.push("spec");
    if (diffs.length) changes.push({ projectId, documentId, bidItemId: b.id, itemNumber: b.itemNumber, changeType: "CHANGED", before: { ...snap(b), fields: diffs }, after: r });
  }
  // Only flag removals for items that came from the owner's schedule.
  for (const b of current) {
    if (!seen.has(normItem(b.itemNumber)) && b.source === "BID_SCHEDULE") {
      changes.push({ projectId, documentId, bidItemId: b.id, itemNumber: b.itemNumber, changeType: "REMOVED", before: snap(b) });
    }
  }
  if (changes.length) await db.bidItemChange.createMany({ data: changes });
  return changes.length;
}

/** RFQs that went out (downloaded or sent) whose lines no longer match the material list. */
export async function affectedRfqs(db: TenantDb, projectId: string) {
  const rfqs = await db.rfq.findMany({ where: { projectId, superseded: false } });
  const out: { id: string; number: string }[] = [];
  const lines = await db.materialLine.findMany({ where: { projectId }, select: { id: true, categoryCode: true } });
  const catOf = new Map(lines.map((l) => [l.id, l.categoryCode ?? "MISC"]));
  const all = await currentRfqLines(db, projectId, "ALL");
  for (const r of rfqs) {
    const used = (await db.rfqDownload.count({ where: { rfqId: r.id } })) + (await db.rfqRecipient.count({ where: { rfqId: r.id } }));
    if (!used) continue;
    const cur = r.categoryCode === "ALL" ? all : all.filter((l) => catOf.get(l.lineId) === r.categoryCode);
    if (hashLines(cur) !== r.contentHash) out.push({ id: r.id, number: r.number });
  }
  return out;
}
