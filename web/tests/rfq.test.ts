import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildRfqXlsx, parseReturnedXlsx, rfqNumber, hashLines, similarity, rfqFileName } from "@/lib/rfq";

const header = {
  number: rfqNumber("IR", 2026, "0142", "AGG", 0), revision: 0, categoryName: "Aggregates",
  company: { id: "c1", name: "Interstate Rock", accentColor: "#FF6B00", logoPath: null },
  project: { name: "Church Farm Road", owner: "Washington City", projectNumber: "WC-1", location: "Washington, UT", bidDueAt: new Date(), quoteDueAt: new Date(), deliveryLocation: null, jobNumber: "0142" },
  estimator: { name: "Est", email: "e@x.com", phone: null }, addenda: "#1, #2", supplier: null,
};
const lines = [
  { lineId: "line-a", description: "3/4 crushed base", spec: "UDOT 02721", specSection: "02721", quantity: 1200, unit: "TON", bidItems: "3" },
  { lineId: "line-b", description: "Pipe bedding sand", spec: null, specSection: null, quantity: 300, unit: "TON", bidItems: "5" },
];

describe("RFQ spreadsheets", () => {
  it("numbers RFQs as prefix-year-job-category-revision", () => {
    expect(header.number).toBe("IR-2026-0142-AGG-R0");
    expect(rfqFileName(header.number, "Aggregates", 0, "xlsx")).toBe("IR-2026-0142 - Aggregates - R0.xlsx");
  });

  it("round-trips: supplier fills prices, import matches by RFQ number and hidden line IDs", async () => {
    const buf = await buildRfqXlsx(header, lines);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet("RFQ")!;
    expect(ws.getColumn(1).hidden).toBe(true);
    expect(wb.getWorksheet("_truegrade")!.state).toBe("veryHidden");
    expect((ws as any).sheetProtection?.sheet).toBe(true);
    // Simulate the supplier filling in yellow cells
    ws.eachRow((r) => {
      const id = String(r.getCell(1).value ?? "");
      if (id === "line-a") { r.getCell(6).value = 18.5; r.getCell(8).value = "2 weeks"; }
      if (String(r.getCell(2).value ?? "").startsWith("SUPPLIER NAME")) r.getCell(3).value = "Acme Aggregates — Bob";
      if (r.getCell(2).value === "Exclusions") r.getCell(3).value = "Delivery over 20 mi";
      // unlocked cells are the only editable ones
      if (id === "line-a") expect(r.getCell(6).protection?.locked).toBe(false);
      if (id === "line-a") expect(r.getCell(2).protection?.locked).not.toBe(false);
    });
    const filled = Buffer.from(await wb.xlsx.writeBuffer());
    const parsed = await parseReturnedXlsx(filled);
    expect(parsed.rfqNumber).toBe("IR-2026-0142-AGG-R0");
    expect(parsed.supplierText).toMatch(/Acme/);
    expect(parsed.terms["Exclusions"]).toBe("Delivery over 20 mi");
    const a = parsed.lines.find((l) => l.lineId === "line-a")!;
    expect(a.unitPrice).toBe(18.5);
    expect(a.leadTime).toBe("2 weeks");
    expect(parsed.lines.find((l) => l.lineId === "line-b")!.unitPrice).toBeNull();
  });

  it("detects content changes for revisions and fuzzy-matches descriptions", () => {
    expect(hashLines(lines)).not.toBe(hashLines([{ ...lines[0], quantity: 1300 }, lines[1]]));
    expect(similarity("16\" MJ 90 bend DI", "16 inch MJ 90 bend ductile iron")).toBeGreaterThan(0.3);
    expect(similarity("pipe bedding sand", "gate valve 12")).toBe(0);
  });
});

describe("description matching", () => {
  it("treats 12\", 12 in and 12in as the same size", () => {
    expect(similarity('12" C900 waterline', "12in C900 water line")).toBeGreaterThan(0.35);
    expect(similarity('12" gate valve', "12 inch MJ gate valve")).toBeGreaterThan(0.5);
    expect(similarity('12" gate valve', '8" gate valve')).toBeLessThan(similarity('12" gate valve', '12" gate valve'));
  });
});
