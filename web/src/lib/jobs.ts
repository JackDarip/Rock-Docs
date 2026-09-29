import { prisma, tenantDb } from "./db";
import { storage } from "./storage";
import { readPdfPages, suggestDocKind } from "./pdftext";
import { extractBidSchedule, extractSupplierQuote, extractQuoteFromText, slicePdf } from "./ai";
import { similarity } from "./rfq";
import { bbox, packTin, parseLandXml } from "./landxml";
import { diffSchedule } from "./addenda";
import { sectionNumbers, normSection } from "./specs";
import { extractSpecRequirements, suggestMeasurements, extractJobCosts, extractWageDetermination, extractEquipmentReport } from "./ai";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { pageTextItems } from "./pdftext";
import { newKey } from "./storage";
import { deliver } from "./mail";
import { afterDelivery, sweepReminders } from "./rfqsend";

// Postgres-backed background job queue with retries and progress. Runs inside
// the web process by default (see instrumentation.ts) or as `npm run worker`.

export type JobType = "PROCESS_DOCUMENT" | "EXTRACT_BID_SCHEDULE" | "EXTRACT_QUOTE" | "SEND_EMAIL" | "EXTRACT_ADDENDUM" | "EXTRACT_SPECS" | "SUGGEST_MEASURE" | "EXTRACT_JOB_COST" | "EXTRACT_SETUP_DOC";

export async function enqueue(companyId: string, type: JobType, payload: Record<string, unknown>) {
  return prisma.job.create({ data: { companyId, type, payload: payload as any } });
}

async function claim() {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "Job" SET status = 'RUNNING', attempts = attempts + 1, "updatedAt" = now()
    WHERE id = (
      SELECT id FROM "Job" WHERE status = 'QUEUED' AND "runAt" <= now()
      ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED
    ) RETURNING id`;
  return rows[0] ? prisma.job.findUnique({ where: { id: rows[0].id } }) : null;
}

const setProgress = (id: string, progress: number) => prisma.job.update({ where: { id }, data: { progress } });

/** "Addendum No. 2", "ADDENDUM #2", "Addendum-2.pdf" → 2 */
function addendumNo(text: string) {
  const m = /addend(?:um|a)[\s_-]*(?:no\.?|number|#)?[\s_-]*(\d{1,3})\b/i.exec(text);
  return m ? Number(m[1]) : null;
}

async function processDocument(companyId: string, jobId: string, p: { documentId: string }) {
  const db = tenantDb(companyId);
  const doc = await db.document.findUnique({ where: { id: p.documentId } });
  if (!doc) return;
  await db.document.update({ where: { id: doc.id }, data: { status: "PROCESSING", statusDetail: "Reading pages" } });
  if (doc.mime === "application/pdf" || /\.pdf$/i.test(doc.filename)) {
    const buf = await storage.get(companyId, doc.storageKey);
    const { pageCount, pages } = await readPdfPages(new Uint8Array(buf), (d, t) => {
      if (d % 10 === 0 || d === t) void setProgress(jobId, Math.round((d / t) * 100));
    });
    await db.sheet.deleteMany({ where: { documentId: doc.id } });
    await db.sheet.createMany({
      data: pages.map((pg) => ({
        documentId: doc.id, projectId: doc.projectId, pageIndex: pg.pageIndex, hasText: pg.hasText,
        sheetNumber: pg.sheetNumber, title: pg.title, scaleText: pg.scaleText,
        classification: pg.classification, discipline: pg.discipline,
      })) as any,
    });
    const textPages = pages.filter((x) => x.hasText).length;
    const suggested = suggestDocKind(doc.filename, pages.slice(0, 2).map((x) => x.text).join(" "), pageCount);
    await db.document.update({
      where: { id: doc.id },
      data: {
        pageCount, hasText: textPages > 0, status: "READY", suggestedKind: suggested,
        specSections: sectionNumbers(pages.map((x) => x.text).join("\n")),
        kind: doc.kindConfirmed ? doc.kind : suggested,
        ...(suggested === "ADDENDUM" && doc.addendumNumber == null ? { addendumNumber: addendumNo(`${doc.filename} ${pages.slice(0, 1).map((x) => x.text).join(" ")}`) } : {}),
        statusDetail: textPages === pageCount ? "Vector PDF: text read directly"
          : textPages === 0 ? "Scanned PDF: no embedded text (AI vision needed for extraction)"
          : `${pageCount - textPages} of ${pageCount} pages are scanned`,
      },
    });
  } else if (/\.(xml|landxml)$/i.test(doc.filename)) {
    const xml = (await storage.get(companyId, doc.storageKey)).toString("utf8");
    const tins = /<LandXML\b/i.test(xml) ? parseLandXml(xml) : [];
    await db.surface.deleteMany({ where: { documentId: doc.id } });
    for (const t of tins) {
      const key = newKey(companyId, `projects/${doc.projectId}/surfaces`, `${t.name}.tin`);
      await storage.put(companyId, key, packTin(t));
      const guessProposed = /\b(fg|finish|final|design|prop|proposed|sg|subgrade)\b/i.test(t.name);
      await db.surface.create({
        data: {
          projectId: doc.projectId, documentId: doc.id, name: t.name, role: guessProposed ? "PROPOSED" : "EXISTING",
          pointCount: t.points.length / 3, faceCount: t.faces.length / 3, units: t.units, bbox: bbox(t) as any, dataKey: key,
        } as any,
      });
    }
    await db.document.update({
      where: { id: doc.id },
      data: {
        status: "READY", suggestedKind: "CAD", kind: doc.kindConfirmed ? doc.kind : "CAD",
        statusDetail: tins.length ? `LandXML: ${tins.length} surface${tins.length === 1 ? "" : "s"} (${tins.map((t) => t.name).join(", ")}). Compare them on the Earthwork page.` : /<LandXML\b/i.test(xml) ? "LandXML file with no TIN surfaces" : "Stored",
      },
    });
  } else {
    await db.document.update({
      where: { id: doc.id },
      data: { status: "READY", suggestedKind: suggestDocKind(doc.filename, "", null), statusDetail: "Stored for reference" },
    });
  }
}

async function extractSchedule(companyId: string, p: { documentId: string; pages?: number[] }) {
  const db = tenantDb(companyId);
  const doc = await db.document.findUnique({ where: { id: p.documentId } });
  if (!doc) return;
  const pdf = await slicePdf(await storage.get(companyId, doc.storageKey), p.pages);
  const res = await extractBidSchedule(companyId, pdf, doc.id);
  const existing = await db.bidItem.count({ where: { projectId: doc.projectId } });
  await db.bidItem.createMany({
    data: res.items.map((it, i) => ({
      projectId: doc.projectId, itemNumber: it.item_number, description: it.description,
      specSection: it.spec_section, unit: it.unit, quantity: it.quantity,
      source: "BID_SCHEDULE", sourceNote: it.note, documentId: doc.id,
      pageIndex: (p.pages?.[it.page - 1] ?? it.page) - 1,
      confidence: it.confidence === "low" ? "LOW" : "HIGH", aiExtracted: true, status: "DRAFT", sortOrder: existing + i,
    })) as any,
  });
  const proj = await db.project.findUnique({ where: { id: doc.projectId } });
  if (proj && (!proj.owner || !proj.projectNumber)) {
    await db.project.update({ where: { id: proj.id }, data: { owner: proj.owner ?? res.owner, projectNumber: proj.projectNumber ?? res.project_number } });
  }
}

async function extractAddendum(companyId: string, p: { documentId: string }) {
  const db = tenantDb(companyId);
  const doc = await db.document.findUnique({ where: { id: p.documentId } });
  if (!doc) return;
  await db.document.update({ where: { id: doc.id }, data: { statusDetail: "Reading the revised bid schedule…" } });
  const res = await extractBidSchedule(companyId, await slicePdf(await storage.get(companyId, doc.storageKey)), doc.id);
  const n = await diffSchedule(db, doc.projectId, doc.id, res.items.map((it) => ({
    itemNumber: it.item_number, description: it.description, unit: it.unit, quantity: it.quantity, specSection: it.spec_section,
  })), doc.uploadedById);
  await db.document.update({ where: { id: doc.id }, data: { statusDetail: res.items.length ? `Found ${res.items.length} bid items; ${n} differ from the current schedule` : "No bid schedule found in this addendum" } });
}

/** Read material requirements for this job's bid items from the uploaded specifications. */
async function extractSpecs(companyId: string, p: { projectId: string }) {
  const db = tenantDb(companyId);
  const items = await db.bidItem.findMany({ where: { projectId: p.projectId }, orderBy: { sortOrder: "asc" } });
  const docs = await db.document.findMany({ where: { projectId: p.projectId, kind: "SPECS" } });
  await db.specRequirement.deleteMany({ where: { projectId: p.projectId, source: "AI", status: "DRAFT" } });
  const byNum = new Map(items.map((b) => [b.itemNumber.trim().toUpperCase(), b]));
  for (const doc of docs) {
    const buf = await storage.get(companyId, doc.storageKey);
    // Send only the pages that mention these bid items' sections or materials (max 60).
    let pages: number[] | undefined;
    if (doc.hasText) {
      const { pages: txt } = await readPdfPages(new Uint8Array(buf));
      const secs = items.map((b) => (b.specSection ? normSection(b.specSection) : "")).filter((x) => x.length >= 3);
      const words = [...new Set(items.flatMap((b) => b.description.toLowerCase().match(/[a-z]{5,}/g) ?? []))];
      const scored = txt.map((pg) => {
        const t = pg.text.toLowerCase(), digits = pg.text.replace(/[^0-9]/g, " ");
        const s = secs.filter((x) => digits.includes(x) || t.replace(/\s/g, "").includes(x)).length * 5 + words.filter((w) => t.includes(w)).length;
        return { n: pg.pageIndex + 1, s };
      }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 60).map((x) => x.n).sort((a, b) => a - b);
      pages = scored.length ? scored : undefined;
    } else if ((doc.pageCount ?? 0) > 60) {
      pages = Array.from({ length: 60 }, (_, i) => i + 1);
    }
    const res = await extractSpecRequirements(companyId, await slicePdf(buf, pages), items.map((b) => ({ itemNumber: b.itemNumber, description: b.description, specSection: b.specSection })), doc.id);
    await db.specRequirement.createMany({
      data: [
        ...res.requirements.map((r) => ({
          projectId: p.projectId, bidItemId: r.item_number ? byNum.get(r.item_number.trim().toUpperCase())?.id ?? null : null,
          specSection: r.spec_section, material: r.material, requirement: r.requirement, documentId: doc.id,
          pageIndex: (pages?.[r.page - 1] ?? r.page) - 1, source: "AI", confidence: r.confidence === "low" ? "LOW" : "HIGH", status: "DRAFT",
        })),
        ...res.missing_standards.map((m) => ({
          projectId: p.projectId, bidItemId: m.item_number ? byNum.get(m.item_number.trim().toUpperCase())?.id ?? null : null,
          requirement: m.note ?? `Cites ${m.reference}`, standardRef: m.reference, missingStandard: true, documentId: doc.id, source: "AI", confidence: "LOW", status: "DRAFT",
        })),
      ] as any,
    });
  }
}

/** AI-suggested quantities for one sheet, pinned to the callouts they were read from. */
async function suggestMeasure(companyId: string, p: { documentId: string; pageIndex: number }) {
  const db = tenantDb(companyId);
  const doc = await db.document.findUnique({ where: { id: p.documentId } });
  if (!doc) return;
  const buf = await storage.get(companyId, doc.storageKey);
  const items = await pageTextItems(new Uint8Array(buf), p.pageIndex);
  const res = await suggestMeasurements(companyId, await slicePdf(buf, [p.pageIndex + 1]), items, doc.id);
  await db.takeoffSuggestion.deleteMany({ where: { documentId: doc.id, pageIndex: p.pageIndex, status: "SUGGESTED" } });
  await db.takeoffSuggestion.createMany({
    data: res.suggestions.map((sg) => {
      const pts = sg.anchors.map((i) => items[i]).filter(Boolean).map((t) => [Math.round(t.x * 10) / 10, Math.round(t.y * 10) / 10]);
      return {
        projectId: doc.projectId, documentId: doc.id, pageIndex: p.pageIndex, kind: sg.kind, label: sg.label, quantity: sg.quantity, unit: sg.unit,
        points: (pts.length ? pts : []) as any, evidence: sg.evidence, confidence: sg.confidence === "high" ? "HIGH" : "LOW", status: "SUGGESTED",
      };
    }) as any,
  });
}

/** Spreadsheets become CSV text; photos become a one-page PDF; PDFs pass through. */
async function aiInput(buf: Buffer, filename: string): Promise<{ pdf?: Buffer; text?: string }> {
  if (/\.xlsx$/i.test(filename)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const out: string[] = [];
    wb.worksheets.forEach((ws) => {
      out.push(`# Sheet: ${ws.name}`);
      ws.eachRow((r) => out.push((r.values as any[]).slice(1).map((v) => (v && typeof v === "object" ? String(v.result ?? v.text ?? "") : String(v ?? ""))).join("\t")));
    });
    return { text: out.join("\n").slice(0, 400_000) };
  }
  if (/\.csv$/i.test(filename)) return { text: buf.toString("utf8").slice(0, 400_000) };
  if (/\.(png|jpe?g)$/i.test(filename)) {
    const doc = await PDFDocument.create();
    const img = /\.png$/i.test(filename) ? await doc.embedPng(buf) : await doc.embedJpg(buf);
    doc.addPage([img.width, img.height]).drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    return { pdf: Buffer.from(await doc.save()) };
  }
  return { pdf: buf };
}

async function extractJobCost(companyId: string, p: { fileId: string }) {
  const db = tenantDb(companyId);
  const f = await db.jobCostFile.findUnique({ where: { id: p.fileId } });
  if (!f) return;
  try {
    const res = await extractJobCosts(companyId, await aiInput(await storage.get(companyId, f.storageKey), f.filename), f.id);
    const n = await db.jobCostLine.count({ where: { jobId: f.jobId } });
    await db.jobCostLine.createMany({
      data: res.lines.map((l, i) => ({
        jobId: f.jobId, fileId: f.id, pageIndex: l.page - 1, activity: l.activity, quantity: l.quantity, unit: l.unit,
        estimatedCost: l.estimated_cost, actualCost: l.actual_cost, estimatedHours: l.estimated_hours, actualHours: l.actual_hours,
        equipment: l.equipment, materials: l.materials, confidence: l.confidence === "low" ? "LOW" : "HIGH", aiExtracted: true, status: "DRAFT", sortOrder: n + i,
      })) as any,
    });
    const job = await db.historicalJob.findUnique({ where: { id: f.jobId } });
    if (job && !job.jobNumber && res.job_number) await db.historicalJob.update({ where: { id: job.id }, data: { jobNumber: res.job_number } });
    await db.jobCostFile.update({ where: { id: f.id }, data: { status: "READY", statusDetail: `Found ${res.lines.length} line${res.lines.length === 1 ? "" : "s"}; review them below` } });
  } catch (e) {
    await db.jobCostFile.update({ where: { id: f.id }, data: { status: "FAILED", statusDetail: e instanceof Error ? e.message : String(e) } });
  }
}

async function extractSetupDoc(companyId: string, p: { draftId: string }) {
  const db = tenantDb(companyId);
  const d = await db.importDraft.findUnique({ where: { id: p.draftId } });
  if (!d) return;
  try {
    const input = await aiInput(await storage.get(companyId, d.storageKey), d.filename);
    if (d.kind === "WAGES") {
      if (!input.pdf) throw new Error("Upload the wage determination as a PDF");
      const r = await extractWageDetermination(companyId, input.pdf, d.id);
      await db.importDraft.update({ where: { id: d.id }, data: { status: "READY", meta: { number: r.determination_number, effective: r.effective_date, counties: r.counties } as any, rows: r.rates as any, statusDetail: `Found ${r.rates.length} classifications` } });
    } else {
      const r = await extractEquipmentReport(companyId, input, d.id);
      await db.importDraft.update({ where: { id: d.id }, data: { status: "READY", rows: r.items as any, statusDetail: `Found ${r.items.length} machines` } });
    }
  } catch (e) {
    await db.importDraft.update({ where: { id: d.id }, data: { status: "FAILED", statusDetail: e instanceof Error ? e.message : String(e) } });
  }
}

async function extractQuote(companyId: string, p: { documentId: string; quoteId: string }) {
  const db = tenantDb(companyId);
  const doc = await db.document.findUnique({ where: { id: p.documentId } });
  const quote = await db.quote.findUnique({ where: { id: p.quoteId } });
  if (!doc || !quote) return;
  const raw = await storage.get(companyId, doc.storageKey);
  const res = doc.mime.startsWith("text/") || /\.(txt|eml)$/i.test(doc.filename)
    ? await extractQuoteFromText(companyId, raw.toString("utf8").slice(0, 200_000), quote.id)
    : await extractSupplierQuote(companyId, raw, quote.id);
  const toDate = (s: string | null) => (s && !isNaN(Date.parse(s)) ? new Date(s) : null);
  const supplier = res.supplier_name
    ? (await db.supplier.findMany({ where: { kind: "SUPPLIER" } })).find((s) => similarity(s.name, res.supplier_name!) > 0.6)
    : null;
  await db.quote.update({
    where: { id: quote.id },
    data: {
      supplierName: quote.supplierName ?? res.supplier_name, supplierId: quote.supplierId ?? supplier?.id ?? null,
      quoteNumber: res.quote_number, quotedAt: toDate(res.quote_date), validUntil: toDate(res.valid_until),
      taxIncluded: res.tax_included, freightIncluded: res.freight_included, minimumOrder: res.minimum_order,
      exclusions: res.exclusions, notes: [res.notes, res.total != null ? `Quote total as printed: $${res.total.toLocaleString("en-US")}` : null].filter(Boolean).join("\n") || null,
    },
  });
  const matLines = await db.materialLine.findMany({ where: { projectId: quote.projectId, excluded: false } });
  await db.quoteLine.createMany({
    data: res.lines.map((l, i) => {
      let best: { id: string; s: number } | null = null;
      for (const m of matLines) {
        const s = similarity(l.description, m.description);
        if (s > 0.5 && (!best || s > best.s)) best = { id: m.id, s };
      }
      return {
        quoteId: quote.id, section: l.section, lineRef: l.line_ref, description: l.description,
        quantity: l.quantity, unit: l.unit, unitPrice: l.unit_price,
        extended: l.extended ?? (l.quantity != null && l.unit_price != null ? l.quantity * l.unit_price : null),
        isAlternate: l.is_alternate, confidence: l.confidence === "low" ? "LOW" : "HIGH",
        materialLineId: best?.id ?? null, matchMethod: best ? "AI" : null, sortOrder: i,
      };
    }) as any,
  });
}

export async function runOnce() {
  const job = await claim();
  if (!job) return false;
  const payload = job.payload as any;
  try {
    if (job.type === "PROCESS_DOCUMENT") await processDocument(job.companyId, job.id, payload);
    else if (job.type === "EXTRACT_BID_SCHEDULE") await extractSchedule(job.companyId, payload);
    else if (job.type === "EXTRACT_QUOTE") await extractQuote(job.companyId, payload);
    else if (job.type === "EXTRACT_ADDENDUM") await extractAddendum(job.companyId, payload);
    else if (job.type === "EXTRACT_SPECS") await extractSpecs(job.companyId, payload);
    else if (job.type === "SUGGEST_MEASURE") await suggestMeasure(job.companyId, payload);
    else if (job.type === "EXTRACT_JOB_COST") await extractJobCost(job.companyId, payload);
    else if (job.type === "EXTRACT_SETUP_DOC") await extractSetupDoc(job.companyId, payload);
    else if (job.type === "SEND_EMAIL") { await deliver(payload.messageId); await afterDelivery(job.companyId, payload.messageId, null); }
    await prisma.job.update({ where: { id: job.id }, data: { status: "DONE", progress: 100, error: null } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const final = job.attempts >= job.maxAttempts || /not configured|limit|declined/i.test(message);
    await prisma.job.update({
      where: { id: job.id },
      data: final
        ? { status: "FAILED", error: message }
        : { status: "QUEUED", error: message, runAt: new Date(Date.now() + 2 ** job.attempts * 5000) },
    });
    if (final && job.type === "SEND_EMAIL") await afterDelivery(job.companyId, payload.messageId, message).catch(() => {});
    if (final && payload?.documentId && job.type === "PROCESS_DOCUMENT") {
      await tenantDb(job.companyId).document.updateMany({ where: { id: payload.documentId }, data: { status: "FAILED", statusDetail: message } });
    }
  }
  return true;
}

let started = false;
export function startWorker(intervalMs = 1500) {
  if (started) return;
  started = true;
  let busy = false;
  // Supplier and estimator reminders: check every 5 minutes.
  const sweep = () => sweepReminders().catch((e) => console.error("[reminders]", e));
  setTimeout(sweep, 10_000);
  setInterval(sweep, 5 * 60_000);
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try { while (await runOnce()) { /* drain */ } } catch (e) { console.error("[jobs]", e); } finally { busy = false; }
  }, intervalMs);
}
