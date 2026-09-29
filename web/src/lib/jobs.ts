import { prisma, tenantDb } from "./db";
import { storage } from "./storage";
import { readPdfPages, suggestDocKind } from "./pdftext";
import { extractBidSchedule, extractSupplierQuote, slicePdf } from "./ai";
import { similarity } from "./rfq";
import { bbox, packTin, parseLandXml } from "./landxml";
import { newKey } from "./storage";
import { deliver } from "./mail";
import { afterDelivery, sweepReminders } from "./rfqsend";

// Postgres-backed background job queue with retries and progress. Runs inside
// the web process by default (see instrumentation.ts) or as `npm run worker`.

export type JobType = "PROCESS_DOCUMENT" | "EXTRACT_BID_SCHEDULE" | "EXTRACT_QUOTE" | "SEND_EMAIL";

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
        kind: doc.kindConfirmed ? doc.kind : suggested,
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

async function extractQuote(companyId: string, p: { documentId: string; quoteId: string }) {
  const db = tenantDb(companyId);
  const doc = await db.document.findUnique({ where: { id: p.documentId } });
  const quote = await db.quote.findUnique({ where: { id: p.quoteId } });
  if (!doc || !quote) return;
  const res = await extractSupplierQuote(companyId, await storage.get(companyId, doc.storageKey), quote.id);
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
