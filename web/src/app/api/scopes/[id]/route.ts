import ExcelJS from "exceljs";
import { apiCtx, contentDisposition, notFound, unauthorized } from "@/lib/apictx";
import { tablePdf } from "@/lib/rfq";
import { POWERED_BY } from "@/config/brand";

type Line = { itemNumber: string; description: string; quantity: number | null; unit: string; note: string | null };

// Subcontractor scope package as Excel (with blank price columns) or PDF.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiCtx();
  if (!ctx) return unauthorized();
  const s = await ctx.db.scopePackage.findUnique({ where: { id: (await params).id } });
  if (!s) return notFound();
  const p = await ctx.db.project.findUniqueOrThrow({ where: { id: s.projectId } });
  const lines = (s.lines ?? []) as Line[];
  const format = new URL(req.url).searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  const base = `${p.jobNumber} - Scope - ${s.name}`.replace(/[\\/:*?"<>|]+/g, "-");
  const info: [string, string][] = [["Project", p.name], ["Owner", p.owner ?? ""], ["Location", p.location ?? ""], ["Bid date", p.bidDueAt ? p.bidDueAt.toLocaleDateString("en-US") : ""], ["Trade", s.trade ?? ""]];
  if (format === "pdf") {
    const buf = await tablePdf({
      company: ctx.company, title: `Subcontractor scope: ${s.name}`, subtitle: `Job ${p.jobNumber}`, info,
      columns: [{ label: "Item", width: 60 }, { label: "Description", width: 360 }, { label: "Qty", width: 80, align: "right" }, { label: "Unit", width: 50 }, { label: "Notes", width: 170 }],
      rows: lines.map((l) => [l.itemNumber, l.description, l.quantity?.toLocaleString("en-US") ?? "", l.unit, l.note ?? ""]),
      notes: s.description ? ["Scope:", s.description] : [],
    });
    return new Response(new Uint8Array(buf), { headers: { "content-type": "application/pdf", "content-disposition": contentDisposition(`${base}.pdf`) } });
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Scope");
  ws.columns = [{ width: 10 }, { width: 55 }, { width: 12 }, { width: 8 }, { width: 14 }, { width: 16 }, { width: 30 }];
  ws.addRow([`${ctx.company.name} — Subcontractor scope: ${s.name}`]).font = { bold: true, size: 14 };
  info.forEach(([k, v]) => ws.addRow([k, v]));
  if (s.description) { ws.addRow([]); ws.addRow(["Scope", s.description]).getCell(2).alignment = { wrapText: true }; }
  ws.addRow([]);
  const h = ws.addRow(["Item", "Description", "Qty", "Unit", "Unit price", "Extended", "Notes / exclusions"]);
  h.font = { bold: true };
  for (const l of lines) {
    const r = ws.addRow([l.itemNumber, l.description, l.quantity, l.unit, null, null, l.note]);
    r.getCell(6).value = { formula: `IF(E${r.number}="","",C${r.number}*E${r.number})` } as any;
    r.getCell(5).numFmt = r.getCell(6).numFmt = "$#,##0.00";
    r.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7ED" } };
  }
  ws.addRow([]);
  ws.addRow([POWERED_BY]).font = { size: 8, color: { argb: "FF94A3B8" } };
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new Response(new Uint8Array(buf), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": contentDisposition(`${base}.xlsx`) } });
}
