import type { TenantDb } from "./db";
import { similarity } from "./rfq";

/** Digits only: "Section 33 11 00" → "331100", "02720" → "02720". */
export const normSection = (s: string) => s.replace(/[^0-9]/g, "");

/** Spec section numbers a document contains, from "SECTION 33 11 00", "Section 02720", "SECTION 301 – …" headings. */
export function sectionNumbers(text: string) {
  const out = new Set<string>();
  const re = /\b(?:SECTION|SEC\.|§)\s*((?:\d{2}[\s.]?\d{2}[\s.]?\d{2}(?:[\s.]\d{2})?)|\d{3,5}(?:\.\d{1,2})?)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const d = normSection(m[1]);
    if (d.length >= 3 && d.length <= 8) out.add(d);
  }
  return [...out];
}

/** Does any uploaded spec text contain this bid item's section? */
export function sectionCovered(section: string | null, indexed: string[][]) {
  if (!section) return true;
  const want = sectionNumbers(`SECTION ${section}`)[0] ?? normSection(section);
  if (!want) return true;
  return indexed.some((list) => list.some((d) => d === want || d.startsWith(want) || want.startsWith(d)));
}

/**
 * A confirmed requirement flows to the bid item and to the material lines that
 * come from it, so the material list and every RFQ state exactly what's required.
 */
export async function applyRequirement(db: TenantDb, req: { bidItemId: string | null; material: string | null; requirement: string; specSection: string | null }) {
  if (!req.bidItemId) return;
  const bi = await db.bidItem.findUnique({ where: { id: req.bidItemId } });
  if (!bi) return;
  const confirmed = await db.specRequirement.findMany({ where: { bidItemId: bi.id, status: "CONFIRMED" } });
  const text = confirmed.map((r) => `${r.material ? `${r.material}: ` : ""}${r.requirement}${r.specSection ? ` (§${r.specSection})` : ""}`).join("; ");
  await db.bidItem.update({ where: { id: bi.id }, data: { specRequirement: text || null, ...(bi.specSection || !req.specSection ? {} : { specSection: req.specSection }) } });
  const lines = (await db.materialLine.findMany({ where: { projectId: bi.projectId } })).filter((l) => ((l.bidItemRefs ?? []) as { bidItemId: string }[]).some((r) => r.bidItemId === bi.id));
  if (!lines.length) return;
  const target = lines.length === 1 ? lines[0]
    : lines.map((l) => ({ l, s: req.material ? similarity(l.description, req.material) : 0 })).sort((a, b) => b.s - a.s).find((x) => x.s >= 0.3)?.l;
  if (!target) return;
  const add = `${req.requirement}${req.specSection ? ` (§${req.specSection})` : ""}`;
  const cur = target.specRequirement ?? "";
  if (cur.includes(req.requirement)) return;
  await db.materialLine.update({
    where: { id: target.id },
    data: {
      specRequirement: cur ? `${cur}; ${add}` : add,
      ...(req.specSection && !(target.specSection ?? "").includes(req.specSection) ? { specSection: target.specSection ? `${target.specSection}, ${req.specSection}` : req.specSection } : {}),
    },
  });
}
