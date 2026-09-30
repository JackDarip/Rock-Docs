import ExcelJS from "exceljs";
import Papa from "papaparse";

export type ScheduleRow = { itemNumber: string; description: string; unit: string; quantity: number | null; specSection: string | null };

/** Read a bid schedule from an owner's Excel/CSV: finds the header row, then maps columns by name. */
export async function parseScheduleFile(buf: Buffer, filename: string): Promise<{ ok: true; rows: ScheduleRow[] } | { ok: false; error: string }> {
  let rows: string[][] = [];
  if (/\.xlsx$/i.test(filename)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    wb.worksheets[0].eachRow((r) => { rows.push((r.values as any[]).slice(1).map((v) => (v && typeof v === "object" ? String(v.result ?? v.text ?? "") : String(v ?? "")).trim())); });
  } else {
    rows = Papa.parse<string[]>(buf.toString("utf8"), { skipEmptyLines: true }).data.map((r) => r.map((c) => String(c).trim()));
  }
  const hi = rows.findIndex((r) => r.some((c) => /desc/i.test(c)) && r.some((c) => /(unit|uom)/i.test(c)));
  if (hi < 0) return { ok: false, error: "Couldn't find a header row with Description and Unit columns" };
  const h = rows[hi].map((c) => c.toLowerCase());
  const col = (...keys: string[]) => h.findIndex((c) => keys.some((k) => c.includes(k)));
  const ci = { item: col("item", "no", "#"), desc: col("desc"), unit: col("unit", "uom"), qty: col("qty", "quant"), spec: col("spec", "section") };
  return {
    ok: true,
    rows: rows.slice(hi + 1).filter((r) => r[ci.desc]).map((r, i) => ({
      itemNumber: (ci.item >= 0 ? r[ci.item] : "") || String(i + 1), description: r[ci.desc],
      unit: (ci.unit >= 0 ? r[ci.unit] : "") || "LS",
      quantity: ci.qty >= 0 && r[ci.qty] ? Number(r[ci.qty].replace(/[,\s]/g, "")) || null : null,
      specSection: ci.spec >= 0 ? r[ci.spec] || null : null,
    })),
  };
}
