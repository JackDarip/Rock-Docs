import ExcelJS from "exceljs";
import { POWERED_BY } from "@/config/brand";
import { bidItemUnitPrices, type EstimateResult } from "./calc";
import { tablePdf } from "./rfq";

type Company = { id: string; name: string; accentColor: string; logoPath: string | null };
type Project = { name: string; jobNumber: string; owner: string | null; projectNumber: string | null; location: string | null; bidDueAt: Date | null };

const m = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const q = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();

export async function bidSummaryPdf(company: Company, p: Project, est: EstimateResult, version: "client" | "internal", addenda: string) {
  const prices = bidItemUnitPrices(est);
  const t = est.totals;
  const info: [string, string][] = [
    ["Project", p.name], ["Owner", p.owner ?? ""], ["Owner project no.", p.projectNumber ?? ""], ["Location", p.location ?? ""],
    ["Bid date", p.bidDueAt ? p.bidDueAt.toLocaleDateString("en-US") : ""], ["Addenda acknowledged", addenda || "None"],
  ];
  if (version === "client") {
    return tablePdf({
      company, title: "Bid Summary", subtitle: `Job ${p.jobNumber}`, info,
      columns: [{ label: "Item", width: 50 }, { label: "Description", width: 330 }, { label: "Qty", width: 70, align: "right" }, { label: "Unit", width: 40 }, { label: "Unit price", width: 110, align: "right" }, { label: "Extended", width: 120, align: "right" }],
      rows: prices.map((x) => [x.itemNumber, x.description, q(x.quantity), x.unit, m(x.unitPrice), m(x.extended)]),
      footerRows: [["TOTAL BID", m(t.total)]],
    });
  }
  const rows: (string | number)[][] = [];
  for (const s of est.sections) {
    for (const l of s.lines) rows.push([s.bidItem.itemNumber, l.assemblyName, q(l.qty), l.unit, m(l.labor), m(l.equipment), m(l.material), m(l.total), l.status.toLowerCase()]);
    if (!s.lines.length) rows.push([s.bidItem.itemNumber, `${s.bidItem.description} (NOT PRICED)`, "", "", "", "", "", "", "blocked"]);
  }
  return tablePdf({
    company, title: "Internal Estimate", subtitle: `Job ${p.jobNumber} · ${est.confidence.pctTrusted}% based on verified, quoted or calibrated data`, info,
    columns: [{ label: "Item", width: 40 }, { label: "Assembly", width: 200 }, { label: "Qty", width: 55, align: "right" }, { label: "Unit", width: 32 }, { label: "Labor", width: 70, align: "right" }, { label: "Equipment", width: 70, align: "right" }, { label: "Materials", width: 70, align: "right" }, { label: "Total", width: 80, align: "right" }, { label: "Basis", width: 103 }],
    rows,
    footerRows: [
      ["Labor", m(t.labor)], ["Equipment", m(t.equipment)], ["Materials", m(t.material)], [`Sales tax (${t.taxPct}%)`, m(t.materialTax)],
      ["Direct cost", m(t.direct)], [`Overhead (${t.overheadPct}%)`, m(t.overhead)], [`Markup (${t.markupPct}%)`, m(t.markup)],
      ["Permits", m(t.permits)], [`Bond (${t.bondPct}%)`, m(t.bond)], ["TOTAL BID", m(t.total)],
    ],
    notes: est.blockers.length ? ["Open issues:", ...est.blockers] : [],
  });
}

export async function bidFormXlsx(company: Company, p: Project, est: EstimateResult) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Bid form");
  ws.columns = [{ width: 10 }, { width: 60 }, { width: 12 }, { width: 8 }, { width: 16 }, { width: 18 }];
  const t = ws.addRow([`${company.name} — Bid form values`]); t.font = { bold: true, size: 14, color: { argb: argb(company.accentColor) } };
  ws.addRow([`${p.name} · Owner project ${p.projectNumber ?? ""} · Job ${p.jobNumber}`]);
  ws.addRow(["Transfer these unit prices to the owner's official bid form, in the same item order."]).font = { italic: true, color: { argb: "FF475569" } };
  ws.addRow([]);
  const h = ws.addRow(["Item", "Description", "Quantity", "Unit", "Unit price", "Extended"]);
  h.font = { bold: true, color: { argb: "FFFFFFFF" } };
  h.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1B33" } }; });
  const first = h.number + 1;
  for (const x of bidItemUnitPrices(est)) {
    const r = ws.addRow([x.itemNumber, x.description, x.quantity, x.unit, Math.round(x.unitPrice * 100) / 100, null]);
    r.getCell(6).value = { formula: `C${r.number}*E${r.number}`, result: x.extended } as any;
    r.getCell(5).numFmt = r.getCell(6).numFmt = "$#,##0.00";
  }
  const last = ws.lastRow!.number;
  const tr = ws.addRow(["", "TOTAL", "", "", "", null]);
  tr.getCell(6).value = { formula: `SUM(F${first}:F${last})`, result: est.totals.total } as any;
  tr.getCell(6).numFmt = "$#,##0.00"; tr.font = { bold: true };
  ws.addRow([]);
  ws.addRow([POWERED_BY]).font = { size: 8, italic: true, color: { argb: "FF94A3B8" } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function bidFormPdf(company: Company, p: Project, est: EstimateResult) {
  const prices = bidItemUnitPrices(est);
  return tablePdf({
    company, title: "Bid Form Values", subtitle: "Unit prices in the owner's bid schedule order",
    info: [["Project", p.name], ["Owner project no.", p.projectNumber ?? ""]],
    columns: [{ label: "Item", width: 50 }, { label: "Description", width: 330 }, { label: "Qty", width: 70, align: "right" }, { label: "Unit", width: 40 }, { label: "Unit price", width: 110, align: "right" }, { label: "Extended", width: 120, align: "right" }],
    rows: prices.map((x) => [x.itemNumber, x.description, q(x.quantity), x.unit, m(x.unitPrice), m(x.extended)]),
    footerRows: [["TOTAL", m(est.totals.total)]],
  });
}

export async function estimateXlsx(company: Company, p: Project, est: EstimateResult) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Estimate");
  ws.columns = [{ width: 8 }, { width: 44 }, { width: 36 }, { width: 11 }, { width: 7 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 14 }, { width: 12 }, { width: 60 }];
  ws.addRow([`${company.name} — ${p.name} (Job ${p.jobNumber})`]).font = { bold: true, size: 14, color: { argb: argb(company.accentColor) } };
  ws.addRow([`${est.confidence.pctTrusted}% of cost is based on verified, quoted, or calibrated data`]);
  ws.addRow([]);
  const h = ws.addRow(["Item", "Bid item", "Assembly", "Qty", "Unit", "Labor", "Equipment", "Materials", "Total", "Basis", "How it was calculated"]);
  h.font = { bold: true };
  for (const s of est.sections) {
    for (const l of s.lines) {
      const r = ws.addRow([s.bidItem.itemNumber, s.bidItem.description, l.assemblyName, l.qty, l.unit, l.labor, l.equipment, l.material, l.total, l.status, l.explain.join("\n")]);
      [6, 7, 8, 9].forEach((c) => (r.getCell(c).numFmt = "$#,##0.00"));
      r.getCell(11).alignment = { wrapText: true, vertical: "top" };
    }
    if (!s.lines.length) ws.addRow([s.bidItem.itemNumber, s.bidItem.description, "NOT PRICED", s.bidItem.quantity, s.bidItem.unit, "", "", "", "", "blocked", s.blocked.join("; ")]);
  }
  ws.addRow([]);
  const t = est.totals;
  for (const [k, v] of [["Labor", t.labor], ["Equipment", t.equipment], ["Materials", t.material], ["Sales tax", t.materialTax], ["Direct cost", t.direct], ["Overhead", t.overhead], ["Markup", t.markup], ["Permits", t.permits], ["Bond", t.bond], ["TOTAL", t.total]] as [string, number][]) {
    const r = ws.addRow(["", "", k, "", "", "", "", "", v]);
    r.getCell(9).numFmt = "$#,##0.00";
    if (k === "TOTAL") r.font = { bold: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function comparisonXlsx(company: Company, p: Project, rows: { description: string; unit: string; quantity: number; prices: (number | null)[]; selected: number | null }[], suppliers: string[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Quote comparison");
  ws.addRow([`${company.name} — Quote comparison — ${p.name}`]).font = { bold: true, size: 14 };
  ws.addRow([]);
  ws.addRow(["Material", "Qty", "Unit", ...suppliers.flatMap((s) => [`${s} unit`, `${s} ext.`])]).font = { bold: true };
  for (const r of rows) {
    const vals: (string | number | null)[] = [r.description, r.quantity, r.unit];
    r.prices.forEach((pr) => vals.push(pr, pr != null ? pr * r.quantity : null));
    const row = ws.addRow(vals);
    r.prices.forEach((pr, i) => {
      row.getCell(4 + i * 2).numFmt = row.getCell(5 + i * 2).numFmt = "$#,##0.00";
      const valid = r.prices.filter((x): x is number => x != null);
      if (pr != null && pr === Math.min(...valid)) row.getCell(4 + i * 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECFDF5" } };
      if (r.selected === i) row.getCell(4 + i * 2).font = { bold: true };
    });
  }
  ws.getColumn(1).width = 46;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
