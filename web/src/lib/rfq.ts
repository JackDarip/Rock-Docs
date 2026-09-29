import crypto from "crypto";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PRODUCT_NAME, POWERED_BY } from "@/config/brand";
import type { TenantDb } from "./db";
import { orderQty } from "./estimate";
import { storage } from "./storage";

export type RfqLine = { lineId: string; description: string; spec: string | null; specSection: string | null; quantity: number; unit: string; bidItems: string };

export type RfqHeader = {
  number: string; revision: number; categoryName: string;
  company: { name: string; accentColor: string; logoPath: string | null; id: string };
  project: { name: string; owner: string | null; projectNumber: string | null; location: string | null; bidDueAt: Date | null; quoteDueAt: Date | null; deliveryLocation: string | null; jobNumber: string };
  estimator: { name: string; email: string; phone: string | null };
  addenda: string;
  supplier?: { name: string; contact: string } | null;
};

export const rfqNumber = (prefix: string, year: number, jobNumber: string, cat: string, rev: number) =>
  `${prefix}-${year}-${jobNumber}-${cat}-R${rev}`;

export const hashLines = (lines: RfqLine[]) =>
  crypto.createHash("sha256").update(JSON.stringify(lines.map((l) => [l.lineId, l.description, l.spec, l.quantity, l.unit]))).digest("hex").slice(0, 16);

/** Current (unsaved) RFQ lines for a category, computed from the material list. */
export async function currentRfqLines(db: TenantDb, projectId: string, categoryCode: string): Promise<RfqLine[]> {
  const lines = await db.materialLine.findMany({
    where: { projectId, excluded: false, ...(categoryCode === "ALL" ? {} : { categoryCode }) },
    orderBy: [{ categoryCode: "asc" }, { sortOrder: "asc" }],
  });
  return lines.map((l) => ({
    lineId: l.id, description: l.description, spec: l.specRequirement, specSection: l.specSection,
    quantity: orderQty(l), unit: l.unit,
    bidItems: ((l.bidItemRefs ?? []) as { itemNumber: string }[]).map((r) => r.itemNumber).filter((v, i, a) => a.indexOf(v) === i).join(", "),
  }));
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-");
export const rfqFileName = (number: string, categoryName: string, rev: number, ext: string, supplier?: string) =>
  safeName(`${number.replace(/-[A-Z0-9]+-R\d+$/, "")} - ${categoryName} - R${rev}${supplier ? ` - ${supplier}` : ""}.${ext}`);

const fmtDate = (d: Date | null) => (d ? d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "");
const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase().padEnd(6, "0").slice(0, 6);

/** Supplier-ready RFQ spreadsheet: locked except supplier-entry cells, hidden line IDs, live formulas. */
export async function buildRfqXlsx(h: RfqHeader, lines: RfqLine[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = h.company.name;
  wb.title = `RFQ ${h.number}`;
  const ws = wb.addWorksheet("RFQ", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const accent = argb(h.company.accentColor || "#FF6B00");

  ws.columns = [
    { key: "id", width: 4, hidden: true },
    { key: "desc", width: 46 },
    { key: "spec", width: 34 },
    { key: "qty", width: 11 },
    { key: "unit", width: 8 },
    { key: "price", width: 13 },
    { key: "ext", width: 15 },
    { key: "lead", width: 14 },
    { key: "notes", width: 32 },
  ];

  let logoRows = 0;
  if (h.company.logoPath && /\.(png|jpe?g)$/i.test(h.company.logoPath)) {
    try {
      const buf = await storage.get(h.company.id, h.company.logoPath);
      const img = wb.addImage({ buffer: buf as any, extension: /png$/i.test(h.company.logoPath) ? "png" : "jpeg" });
      ws.addImage(img, { tl: { col: 1, row: 0 }, ext: { width: 160, height: 60 } });
      logoRows = 4;
    } catch { /* logo optional */ }
  }
  for (let i = 0; i < logoRows; i++) ws.addRow([]);

  const title = ws.addRow(["", `${h.company.name} — Request for Quotation`]);
  title.font = { bold: true, size: 16, color: { argb: accent } };
  const numRow = ws.addRow(["", `RFQ No. ${h.number}`, `Category: ${h.categoryName}`, "", "", `Revision ${h.revision}`]);
  numRow.font = { bold: true, size: 12 };

  const info: [string, string][] = [
    ["Project", h.project.name],
    ["Owner", h.project.owner ?? ""],
    ["Owner project no.", h.project.projectNumber ?? ""],
    ["Location", h.project.location ?? ""],
    ["Bid date", fmtDate(h.project.bidDueAt)],
    ["QUOTE DUE", fmtDate(h.project.quoteDueAt)],
    ["Deliver to", h.project.deliveryLocation ?? h.project.location ?? ""],
    ["Estimator", `${h.estimator.name}  ${h.estimator.phone ?? ""}  ${h.estimator.email}`],
    ["Addenda included", h.addenda || "None issued"],
  ];
  for (const [k, v] of info) {
    const r = ws.addRow(["", k, v]);
    r.getCell(2).font = { bold: true, color: { argb: "FF475569" } };
    ws.mergeCells(r.number, 3, r.number, 9);
  }
  ws.addRow([]);
  const supRow = ws.addRow(["", "SUPPLIER NAME / CONTACT (fill in):", h.supplier ? `${h.supplier.name} — ${h.supplier.contact}` : ""]);
  supRow.getCell(2).font = { bold: true };
  ws.mergeCells(supRow.number, 3, supRow.number, 9);
  const supCell = supRow.getCell(3);
  supCell.protection = { locked: false };
  supCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7ED" } };
  supCell.border = { bottom: { style: "thin" } };
  ws.addRow([]);

  const head = ws.addRow(["LINE ID", "Description", "Spec requirement / section", "Quantity", "Unit", "UNIT PRICE", "EXTENDED PRICE", "Lead time", "Notes / alternate offered"]);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1B33" } }; c.alignment = { vertical: "middle", wrapText: true }; });
  const firstLine = head.number + 1;

  for (const l of lines) {
    const r = ws.addRow([l.lineId, l.description, [l.spec, l.specSection && `Sec. ${l.specSection}`].filter(Boolean).join(" — "), l.quantity, l.unit, null, null, null, null]);
    const n = r.number;
    r.getCell(7).value = { formula: `IF(ISNUMBER(F${n}),D${n}*F${n},"")`, result: "" } as any;
    r.getCell(4).numFmt = "#,##0.00";
    r.getCell(6).numFmt = "$#,##0.00";
    r.getCell(7).numFmt = "$#,##0.00";
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
    r.getCell(3).alignment = { wrapText: true, vertical: "top" };
    for (const c of [6, 8, 9]) {
      const cell = r.getCell(c);
      cell.protection = { locked: false };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7ED" } };
      cell.border = { top: { style: "hair" }, bottom: { style: "hair" }, left: { style: "hair" }, right: { style: "hair" } };
    }
  }
  const lastLine = ws.lastRow!.number;
  const tot = ws.addRow(["", "", "", "", "", "TOTAL", null]);
  tot.getCell(7).value = { formula: lines.length ? `SUM(G${firstLine}:G${lastLine})` : "0", result: 0 } as any;
  tot.getCell(7).numFmt = "$#,##0.00";
  tot.font = { bold: true };
  ws.addRow([]);

  const terms = ["Quote valid until", "Sales tax included? (Y/N)", "Freight / delivery included? (Y/N)", "Minimum order", "Exclusions"];
  const tHead = ws.addRow(["", "TERMS (supplier to complete)"]);
  tHead.font = { bold: true, color: { argb: accent } };
  for (const t of terms) {
    const r = ws.addRow(["", t, ""]);
    ws.mergeCells(r.number, 3, r.number, 9);
    const c = r.getCell(3);
    c.protection = { locked: false };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7ED" } };
    c.border = { bottom: { style: "thin" } };
  }
  ws.addRow([]);
  const foot = ws.addRow(["", `Return this file with prices filled in. Please don't add or reorder lines; put alternates in the Notes column. ${POWERED_BY}`]);
  foot.font = { italic: true, size: 8, color: { argb: "FF94A3B8" } };

  await ws.protect(crypto.randomBytes(9).toString("base64"), {
    selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, formatRows: true,
  });

  // Machine-readable identity so a returned file matches the right job, category, and revision.
  const meta = wb.addWorksheet("_truegrade", { state: "veryHidden" });
  meta.addRow(["rfqNumber", h.number]);
  meta.addRow(["revision", h.revision]);
  meta.addRow(["firstLineRow", firstLine]);
  meta.addRow(["lastLineRow", lastLine]);
  meta.addRow(["generator", PRODUCT_NAME]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function buildRfqCsv(h: RfqHeader, lines: RfqLine[]) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [
    ["RFQ No.", h.number], ["Project", h.project.name], ["Quote due", fmtDate(h.project.quoteDueAt)], [],
    ["Line ID", "Description", "Spec", "Spec section", "Quantity", "Unit", "Unit price", "Extended", "Lead time", "Notes"],
    ...lines.map((l) => [l.lineId, l.description, l.spec, l.specSection, l.quantity, l.unit, "", "", "", ""]),
  ];
  return Buffer.from(rows.map((r) => r.map(esc).join(",")).join("\r\n"), "utf8");
}

// ---------- PDF helpers ----------

export function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Simple table PDF writer shared by RFQ and bid output PDFs. */
export async function tablePdf(opts: {
  company: { id: string; name: string; accentColor: string; logoPath: string | null };
  title: string; subtitle?: string; info: [string, string][];
  columns: { label: string; width: number; align?: "left" | "right" }[];
  rows: (string | number)[][]; footerRows?: [string, string][]; notes?: string[];
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = hexToRgb(opts.company.accentColor || "#FF6B00");
  const W = 792, H = 612, M = 36;
  let logo: any = null;
  if (opts.company.logoPath && /\.(png|jpe?g)$/i.test(opts.company.logoPath)) {
    try {
      const buf = await storage.get(opts.company.id, opts.company.logoPath);
      logo = /png$/i.test(opts.company.logoPath) ? await pdf.embedPng(buf) : await pdf.embedJpg(buf);
    } catch { logo = null; }
  }
  const clean = (s: string) => s.replace(/[^\x20-\x7E]/g, (c) => (c === "—" || c === "–" || c === "·" ? "-" : c === "×" ? "x" : c === "’" || c === "‘" ? "'" : c === "“" || c === "”" ? '"' : " "));
  const fit = (s: string, w: number, f = font, size = 8) => {
    let t = clean(s);
    while (t.length > 1 && f.widthOfTextAtSize(t, size) > w - 4) t = t.slice(0, -2) + ".";
    return t;
  };
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const pages: any[] = [page];
  const header = () => {
    let x = M;
    if (logo) {
      const s = Math.min(120 / logo.width, 40 / logo.height);
      page.drawImage(logo, { x, y: y - logo.height * s, width: logo.width * s, height: logo.height * s });
      x += logo.width * s + 12;
    }
    page.drawText(clean(opts.company.name), { x, y: y - 14, size: 14, font: bold, color: accent });
    page.drawText(clean(opts.title), { x, y: y - 30, size: 11, font: bold });
    if (opts.subtitle) page.drawText(clean(opts.subtitle), { x, y: y - 43, size: 9, font });
    y -= 56;
  };
  const tableHead = () => {
    let x = M;
    page.drawRectangle({ x: M, y: y - 14, width: W - 2 * M, height: 16, color: rgb(0.043, 0.106, 0.2) });
    for (const c of opts.columns) {
      page.drawText(fit(c.label, c.width, bold, 8), { x: x + 2, y: y - 10, size: 8, font: bold, color: rgb(1, 1, 1) });
      x += c.width;
    }
    y -= 26;
  };
  const newPage = () => { page = pdf.addPage([W, H]); pages.push(page); y = H - M; header(); tableHead(); };

  header();
  for (let i = 0; i < opts.info.length; i += 2) {
    const pair = opts.info.slice(i, i + 2);
    pair.forEach(([k, v], j) => {
      const x = M + j * 360;
      page.drawText(clean(k) + ":", { x, y, size: 8.5, font: bold, color: rgb(0.28, 0.33, 0.41) });
      page.drawText(fit(v, 260, font, 8.5), { x: x + 95, y, size: 8.5, font });
    });
    y -= 12;
  }
  y -= 6;
  tableHead();
  opts.rows.forEach((row, ri) => {
    if (y < M + 40) newPage();
    if (ri % 2 === 1) page.drawRectangle({ x: M, y: y - 3, width: W - 2 * M, height: 12, color: rgb(0.973, 0.98, 0.988) });
    let x = M;
    row.forEach((cell, ci) => {
      const col = opts.columns[ci];
      const txt = fit(String(cell ?? ""), col.width);
      const tx = col.align === "right" ? x + col.width - 3 - font.widthOfTextAtSize(txt, 8) : x + 2;
      page.drawText(txt, { x: tx, y, size: 8, font });
      x += col.width;
    });
    y -= 12;
  });
  if (opts.footerRows?.length) {
    y -= 6;
    for (const [k, v] of opts.footerRows) {
      if (y < M + 30) newPage();
      const tw = bold.widthOfTextAtSize(clean(v), 9);
      page.drawText(clean(k), { x: W - M - 260, y, size: 9, font: bold });
      page.drawText(clean(v), { x: W - M - tw, y, size: 9, font: bold });
      y -= 13;
    }
  }
  for (const n of opts.notes ?? []) {
    if (y < M + 30) newPage();
    y -= 4;
    page.drawText(fit(n, W - 2 * M, font, 8), { x: M, y, size: 8, font, color: rgb(0.28, 0.33, 0.41) });
    y -= 11;
  }
  pages.forEach((p, i) => {
    p.drawText(`${POWERED_BY}`, { x: M, y: 18, size: 7, font, color: rgb(0.58, 0.64, 0.72) });
    p.drawText(`Page ${i + 1} of ${pages.length}`, { x: W - M - 50, y: 18, size: 7, font, color: rgb(0.58, 0.64, 0.72) });
  });
  return Buffer.from(await pdf.save());
}

export async function buildRfqPdf(h: RfqHeader, lines: RfqLine[]) {
  return tablePdf({
    company: h.company,
    title: `Request for Quotation ${h.number}`,
    subtitle: `${h.categoryName} — Revision ${h.revision}`,
    info: [
      ["Project", h.project.name], ["Owner", h.project.owner ?? ""],
      ["Owner project no.", h.project.projectNumber ?? ""], ["Location", h.project.location ?? ""],
      ["Bid date", fmtDate(h.project.bidDueAt)], ["Quote due", fmtDate(h.project.quoteDueAt)],
      ["Deliver to", h.project.deliveryLocation ?? h.project.location ?? ""], ["Addenda", h.addenda || "None issued"],
      ["Estimator", `${h.estimator.name} ${h.estimator.phone ?? ""}`], ["Email", h.estimator.email],
      ["Supplier", h.supplier ? `${h.supplier.name} - ${h.supplier.contact}` : "________________________"], ["", ""],
    ],
    columns: [
      { label: "Description", width: 230 }, { label: "Spec / section", width: 170 },
      { label: "Qty", width: 60, align: "right" }, { label: "Unit", width: 40 },
      { label: "Unit price", width: 80, align: "right" }, { label: "Extended", width: 140, align: "right" },
    ],
    rows: lines.map((l) => [l.description, [l.spec, l.specSection].filter(Boolean).join(" / "), l.quantity.toLocaleString("en-US"), l.unit, "", ""]),
    notes: ["Reference copy. Please quote on the Excel RFQ or your own quote form and reference the RFQ number above.",
      "Terms: quote valid until ____  Tax incl. Y/N  Freight incl. Y/N  Minimum order ____  Exclusions ____"],
  });
}

// ---------- Returned spreadsheet import ----------

export type ParsedReturn = {
  rfqNumber: string | null; supplierText: string | null;
  lines: { lineId: string | null; description: string; quantity: number | null; unit: string | null; unitPrice: number | null; leadTime: string | null; notes: string | null }[];
  terms: Record<string, string>;
};

const cellText = (v: ExcelJS.CellValue): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("result" in (v as any)) return String((v as any).result ?? "");
    if ("richText" in (v as any)) return (v as any).richText.map((r: any) => r.text).join("");
    if ("text" in (v as any)) return String((v as any).text);
    if (v instanceof Date) return v.toISOString();
  }
  return String(v);
};
const cellNum = (v: ExcelJS.CellValue) => {
  const s = cellText(v).replace(/[$,\s]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

export async function parseReturnedXlsx(buf: Buffer): Promise<ParsedReturn> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const meta = wb.getWorksheet("_truegrade");
  let rfqNumber: string | null = null;
  if (meta) meta.eachRow((r) => { if (cellText(r.getCell(1).value) === "rfqNumber") rfqNumber = cellText(r.getCell(2).value); });
  const ws = wb.getWorksheet("RFQ") ?? wb.worksheets.find((w) => w.state === "visible")!;
  const out: ParsedReturn = { rfqNumber, supplierText: null, lines: [], terms: {} };
  let headerRow = -1;
  ws.eachRow((r, n) => {
    const b = cellText(r.getCell(2).value);
    if (!rfqNumber) { const m = /RFQ No\.\s*(\S+)/.exec(b); if (m) out.rfqNumber = m[1]; }
    if (/^SUPPLIER NAME/i.test(b)) out.supplierText = cellText(r.getCell(3).value) || null;
    if (/^Description$/i.test(b) && headerRow < 0) headerRow = n;
    if (["Quote valid until", "Sales tax included? (Y/N)", "Freight / delivery included? (Y/N)", "Minimum order", "Exclusions"].includes(b))
      out.terms[b] = cellText(r.getCell(3).value);
  });
  if (rfqNumber) out.rfqNumber = rfqNumber;
  if (headerRow > 0) {
    for (let n = headerRow + 1; n <= ws.rowCount; n++) {
      const r = ws.getRow(n);
      const desc = cellText(r.getCell(2).value);
      if (!desc && !cellText(r.getCell(1).value)) break;
      if (/^TOTAL$/i.test(cellText(r.getCell(6).value))) break;
      out.lines.push({
        lineId: cellText(r.getCell(1).value) || null, description: desc,
        quantity: cellNum(r.getCell(4).value), unit: cellText(r.getCell(5).value) || null,
        unitPrice: cellNum(r.getCell(6).value), leadTime: cellText(r.getCell(8).value) || null, notes: cellText(r.getCell(9).value) || null,
      });
    }
  }
  return out;
}

const STOP = new Set(["x", "and", "with", "w", "the", "of", "for", "less", "per"]);

/** Token-overlap similarity for fallback matching (always sent to human review). */
export function similarity(a: string, b: string) {
  const tok = (s: string) => new Set(
    s.toLowerCase()
      .replace(/(\d+(?:\.\d+)?)\s*(?:"|''|in\b|inch(?:es)?\b)/g, "$1in")
      .replace(/(\d+(?:\.\d+)?)\s*(?:'|ft\b|feet\b)/g, "$1ft")
      .split(/[^a-z0-9.]+/).filter((t) => t.length > 0 && !STOP.has(t)));
  const A = tok(a), B = tok(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.sqrt(A.size * B.size);
}
