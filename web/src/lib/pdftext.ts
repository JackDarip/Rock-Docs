
// Server-side PDF reading with pdf.js: page count, embedded text per page and
// title-block heuristics. Vector PDFs are read directly; pages with no text
// are flagged as scanned so vision/OCR only runs where it's needed.

export type PageInfo = {
  pageIndex: number; hasText: boolean; text: string;
  sheetNumber: string | null; title: string | null; scaleText: string | null;
  classification: string | null; discipline: string | null;
};

const CLASS_RULES: [string, RegExp][] = [
  ["cover", /\b(cover sheet|index of (sheets|drawings)|sheet index|vicinity map)\b/i],
  ["quantity_summary", /\b(quantit(y|ies) summary|summary of quantities|estimated quantities|bid quantities)\b/i],
  ["general_notes", /\bgeneral notes\b/i],
  ["traffic_control", /\b(traffic control|detour|mot plan|maintenance of traffic)\b/i],
  ["erosion_control", /\b(erosion|swppp|sediment control|storm water pollution)\b/i],
  ["cross_sections", /\bcross[- ]sections?\b/i],
  ["utility_plan_profile", /\b(plan (and|&) profile|sewer|water ?line|storm drain|waterline)\b/i],
  ["grading", /\b(grading|earthwork|site plan)\b/i],
  ["paving", /\b(paving|pavement|striping|asphalt)\b/i],
  ["structures", /\b(bridge|abutment|girder|structural|retaining wall|box culvert)\b/i],
  ["details", /\b(details?|standard drawings?)\b/i],
];
const DISCIPLINES: Record<string, string> = { G: "General", C: "Civil", S: "Structural", E: "Electrical", L: "Landscape", U: "Utility", T: "Traffic", M: "Mechanical", P: "Plumbing", A: "Architectural", D: "Details", X: "Cross sections" };

export function classifyText(text: string) {
  for (const [cls, re] of CLASS_RULES) if (re.test(text)) return cls;
  return null;
}

export function suggestDocKind(filename: string, firstText: string, pageCount: number | null) {
  const s = `${filename} ${firstText.slice(0, 4000)}`;
  if (/addend(um|a)/i.test(s)) return "ADDENDUM";
  if (/\.(xml|landxml|dxf|dwg)$/i.test(filename)) return "CAD";
  if (/\b(quot(e|ation)|bid no:|price quote)\b/i.test(s)) return "QUOTE";
  if (/\b(bid (form|schedule|proposal)|schedule of (values|items|prices))\b/i.test(s)) return "BID_SCHEDULE";
  if (/\b(geotech|soils? report|boring log)/i.test(s)) return "GEOTECH";
  if (/\b(specifications?|special provisions|division \d+)\b/i.test(s)) return "SPECS";
  if ((pageCount ?? 0) >= 3 && /\b(sheet|scale)\b/i.test(s)) return "PLANS";
  if (/\.(xlsx?|csv)$/i.test(filename)) return "BID_SCHEDULE";
  return "OTHER";
}

export async function readPdfPages(data: Uint8Array, onProgress?: (done: number, total: number) => void): Promise<{ pageCount: number; pages: PageInfo[] }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data, verbosity: 0, useSystemFonts: false, disableFontFace: true }).promise;
  const pages: PageInfo[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = (tc.items as any[]).filter((it) => typeof it.str === "string" && it.str.trim());
    const text = items.map((it) => it.str).join(" ");
    // Title block usually sits in the bottom-right corner (or right edge strip).
    const inBlock = items.filter((it) => it.transform[4] > vp.width * 0.62 && it.transform[5] < vp.height * 0.3);
    const blockText = inBlock.map((it) => it.str.trim());
    const numRe = /^([A-Z]{1,3}[-.]?\d{1,3}(?:\.\d{1,2})?[A-Z]?)$/;
    const sheetNumber = [...blockText].reverse().find((s) => numRe.test(s)) ?? null;
    const titleCand = inBlock
      .filter((it) => /[A-Za-z]{3,}/.test(it.str) && !numRe.test(it.str.trim()))
      .sort((a, b) => Math.abs(b.transform[0]) - Math.abs(a.transform[0]) || b.str.length - a.str.length)[0];
    const scale = /\bscale\s*[:=]?\s*(1"\s*=\s*\d+'?|\d+\s*:\s*\d+|nts|as noted)/i.exec(text)?.[1] ?? null;
    const prefix = sheetNumber?.match(/^[A-Z]/)?.[0];
    pages.push({
      pageIndex: i - 1, hasText: items.length > 10, text: text.slice(0, 20000),
      sheetNumber, title: titleCand?.str.trim().slice(0, 120) ?? null, scaleText: scale,
      classification: classifyText(`${titleCand?.str ?? ""} ${blockText.join(" ")}`) ?? classifyText(text.slice(0, 3000)),
      discipline: prefix ? DISCIPLINES[prefix] ?? null : null,
    });
    page.cleanup();
    onProgress?.(i, doc.numPages);
  }
  await doc.destroy();
  return { pageCount: pages.length, pages };
}
