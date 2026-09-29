"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCtx, requireAdminCtx } from "@/lib/auth";
import { enqueue } from "@/lib/jobs";
import { aiEnabled, assertAiBudget, estimateAiCost } from "@/lib/ai";
import { newKey, storage } from "@/lib/storage";
import { currentRfqLines, hashLines, parseReturnedXlsx, rfqNumber, similarity } from "@/lib/rfq";

async function project(projectId: string) {
  const ctx = await requireCtx();
  const p = await ctx.db.project.findUnique({ where: { id: projectId } });
  if (!p) throw new Error("Bid not found");
  return { ...ctx, project: p };
}

/**
 * Create or refresh one RFQ per supplier category plus a combined master.
 * An RFQ that has been downloaded or sent is never changed in place: a new
 * revision (R1, R2…) is created and the old one is marked superseded.
 */
export async function generateRfqs(projectId: string) {
  const { db, company, project: p, user } = await project(projectId);
  const lines = await db.materialLine.findMany({ where: { projectId, excluded: false } });
  const cats = [...new Set(lines.map((l) => l.categoryCode ?? "MISC"))];
  const year = (p.bidDueAt ?? new Date()).getFullYear();
  const results: { category: string; action: string }[] = [];
  const all = await currentRfqLines(db, projectId, "ALL");
  const catOf = new Map(lines.map((l) => [l.id, l.categoryCode ?? "MISC"]));
  for (const cat of [...cats, "ALL"]) {
    const catLines = cat === "ALL" ? all : all.filter((l) => catOf.get(l.lineId) === cat);
    if (!catLines.length) continue;
    const hash = hashLines(catLines);
    const latest = await db.rfq.findFirst({ where: { projectId, categoryCode: cat, superseded: false }, orderBy: { revision: "desc" } });
    if (latest?.contentHash === hash) { results.push({ category: cat, action: "unchanged" }); continue; }
    if (latest) {
      const used = (await db.rfqDownload.count({ where: { rfqId: latest.id } })) + (await db.rfqRecipient.count({ where: { rfqId: latest.id } }));
      if (!used) {
        await db.rfq.update({ where: { id: latest.id }, data: { lines: catLines as any, contentHash: hash } });
        results.push({ category: cat, action: "updated" });
        continue;
      }
      await db.rfq.update({ where: { id: latest.id }, data: { superseded: true } });
    }
    const rev = latest ? latest.revision + 1 : 0;
    await db.rfq.create({
      data: {
        projectId, categoryCode: cat, revision: rev, number: rfqNumber(company.rfqPrefix, year, p.jobNumber, cat, rev),
        lines: catLines as any, contentHash: hash, createdById: user.id,
      } as any,
    });
    results.push({ category: cat, action: latest ? `revision ${rev}` : "created" });
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  return results;
}

const recipientSchema = z.object({
  supplierId: z.string().nullable(), name: z.string().trim().min(1), email: z.string().trim().email().nullable().or(z.literal("").transform(() => null)),
  saveToDirectory: z.boolean().optional(),
});

/** Record an RFQ sent outside TrueGrade so it shows up in the same tracker. */
export async function markSent(rfqId: string, recipients: unknown[], sentAt: string | null) {
  const { db, user } = await requireCtx();
  const rfq = await db.rfq.findUnique({ where: { id: rfqId } });
  if (!rfq) return { ok: false, error: "RFQ not found" };
  const p = await db.project.findUnique({ where: { id: rfq.projectId } });
  for (const raw of recipients) {
    const r = recipientSchema.parse(raw);
    let supplierId = r.supplierId;
    if (supplierId && !(await db.supplier.findUnique({ where: { id: supplierId } }))) supplierId = null;
    if (!supplierId && r.saveToDirectory) {
      const s = await db.supplier.create({ data: { name: r.name, kind: "SUPPLIER", categories: rfq.categoryCode === "ALL" ? [] : [rfq.categoryCode] } as any });
      if (r.email) await db.contact.create({ data: { supplierId: s.id, name: r.name, email: r.email, isPrimary: true } as any });
      supplierId = s.id;
    }
    const expires = new Date(Math.max(Date.now() + 30 * 864e5, (p?.quoteDueAt?.getTime() ?? 0) + 14 * 864e5));
    await db.rfqRecipient.create({
      data: {
        rfqId, supplierId, name: r.name, email: r.email ?? null, method: "OUTSIDE", status: "SENT",
        sentAt: sentAt ? new Date(sentAt) : new Date(), token: crypto.randomBytes(24).toString("base64url"), tokenExpiresAt: expires, createdById: user.id,
      } as any,
    });
  }
  revalidatePath(`/projects/${rfq.projectId}/rfqs`);
  return { ok: true };
}

export async function setRecipientStatus(id: string, status: "SENT" | "RESPONDED" | "DECLINED") {
  const { db } = await requireCtx();
  const r = await db.rfqRecipient.update({ where: { id }, data: { status } });
  const rfq = await db.rfq.findUnique({ where: { id: r.rfqId } });
  if (rfq) revalidatePath(`/projects/${rfq.projectId}/rfqs`);
}

// ---------- Quote intake ----------

export async function uploadQuotes(projectId: string, formData: FormData) {
  const { db, company, user } = await project(projectId);
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const presetSupplier = (formData.get("supplierId") as string) || null;
  const matLines = await db.materialLine.findMany({ where: { projectId } });
  const suppliers = await db.supplier.findMany({ where: { kind: "SUPPLIER" } });
  const out: { file: string; status: string }[] = [];
  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    const key = newKey(company.id, `projects/${projectId}/quotes`, file.name);
    await storage.put(company.id, key, buf);
    const doc = await db.document.create({
      data: { projectId, filename: file.name, storageKey: key, size: buf.length, mime: file.type || "application/octet-stream", kind: "QUOTE", kindConfirmed: true, status: "READY", uploadedById: user.id } as any,
    });
    if (/\.xlsx$/i.test(file.name)) {
      const parsed = await parseReturnedXlsx(buf);
      const rfq = parsed.rfqNumber ? await db.rfq.findFirst({ where: { number: parsed.rfqNumber, projectId } }) : null;
      const sup = presetSupplier ?? (parsed.supplierText ? suppliers.find((s) => similarity(s.name, parsed.supplierText!.split(/[—-]/)[0]) > 0.6)?.id ?? null : null);
      const t = parsed.terms;
      const yes = (v?: string) => (v ? /^y/i.test(v.trim()) : null);
      const quote = await db.quote.create({
        data: {
          projectId, rfqId: rfq?.id ?? null, rfqRevision: rfq?.revision ?? null, supplierId: sup,
          supplierName: sup ? suppliers.find((s) => s.id === sup)?.name : parsed.supplierText, source: "XLSX", documentId: doc.id,
          validUntil: t["Quote valid until"] && !isNaN(Date.parse(t["Quote valid until"])) ? new Date(t["Quote valid until"]) : null,
          taxIncluded: yes(t["Sales tax included? (Y/N)"]), freightIncluded: yes(t["Freight / delivery included? (Y/N)"]),
          minimumOrder: t["Minimum order"] || null, exclusions: t["Exclusions"] || null, quotedAt: new Date(),
        } as any,
      });
      await db.quoteLine.createMany({
        data: parsed.lines.map((l, i) => {
          const byId = l.lineId ? matLines.find((m) => m.id === l.lineId) : null;
          let fallback: string | null = null;
          if (!byId) {
            const best = matLines.map((m) => ({ m, s: similarity(l.description, m.description) })).sort((a, b) => b.s - a.s)[0];
            if (best && best.s > 0.55) fallback = best.m.id;
          }
          return {
            quoteId: quote.id, description: l.description, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice,
            extended: l.unitPrice != null && l.quantity != null ? l.unitPrice * l.quantity : null, leadTime: l.leadTime, notes: l.notes,
            isAlternate: !!l.notes && /alt/i.test(l.notes), materialLineId: byId?.id ?? fallback,
            matchMethod: byId ? "LINE_ID" : fallback ? "TEXT" : null, confidence: byId ? "HIGH" : "LOW", sortOrder: i,
          };
        }) as any,
      });
      out.push({ file: file.name, status: rfq ? `Matched to ${rfq.number}` : "No RFQ number found; lines matched by description (review needed)" });
    } else if (/\.pdf$/i.test(file.name)) {
      const quote = await db.quote.create({
        data: { projectId, supplierId: presetSupplier, supplierName: presetSupplier ? suppliers.find((s) => s.id === presetSupplier)?.name : null, source: "PDF", documentId: doc.id } as any,
      });
      if (aiEnabled()) {
        try {
          await assertAiBudget(company.id, estimateAiCost(10).usd);
          await enqueue(company.id, "EXTRACT_QUOTE", { documentId: doc.id, quoteId: quote.id });
          out.push({ file: file.name, status: "Reading the supplier's PDF with AI. Lines will appear for review." });
        } catch (e: any) { out.push({ file: file.name, status: e.message }); }
      } else {
        out.push({ file: file.name, status: "Stored. AI reading isn't configured, so enter the prices on the review screen." });
      }
    } else {
      out.push({ file: file.name, status: "Stored as a document (use .xlsx or .pdf for automatic reading)" });
    }
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  return out;
}

const quoteHeader = z.object({
  supplierId: z.string().nullable(), supplierName: z.string().nullable(), quoteNumber: z.string().nullable(),
  validUntil: z.coerce.date().nullable(), quotedAt: z.coerce.date().nullable(), taxIncluded: z.boolean().nullable(), freightIncluded: z.boolean().nullable(),
  minimumOrder: z.string().nullable(), exclusions: z.string().nullable(), notes: z.string().nullable(),
}).partial();

export async function updateQuote(quoteId: string, data: unknown) {
  const { db } = await requireCtx();
  const d = quoteHeader.parse(data);
  if (d.supplierId) {
    const s = await db.supplier.findUnique({ where: { id: d.supplierId } });
    if (!s) throw new Error("Unknown supplier");
    d.supplierName = s.name;
  }
  const q = await db.quote.update({ where: { id: quoteId }, data: d });
  revalidatePath(`/projects/${q.projectId}`, "layout");
}

export async function confirmQuote(quoteId: string) {
  const { db } = await requireCtx();
  const q = await db.quote.findUnique({ where: { id: quoteId } });
  if (!q) return { ok: false, error: "Quote not found" };
  if (!q.supplierName) return { ok: false, error: "Pick which supplier this quote came from first" };
  await db.quote.update({ where: { id: quoteId }, data: { status: "CONFIRMED" } });
  if (q.rfqId) await db.rfqRecipient.updateMany({ where: { rfqId: q.rfqId, supplierId: q.supplierId ?? "__none__" }, data: { status: "RESPONDED" } });
  revalidatePath(`/projects/${q.projectId}`, "layout");
  return { ok: true };
}

export async function deleteQuote(quoteId: string) {
  const { db } = await requireCtx();
  const q = await db.quote.findUnique({ where: { id: quoteId } });
  if (!q) return;
  const lineIds = (await db.quoteLine.findMany({ where: { quoteId } })).map((l) => l.id);
  await db.materialLine.updateMany({ where: { selectedQuoteLineId: { in: lineIds } }, data: { selectedQuoteLineId: null } });
  await db.quoteLine.deleteMany({ where: { quoteId } });
  await db.quote.delete({ where: { id: quoteId } });
  revalidatePath(`/projects/${q.projectId}`, "layout");
}

export async function selectQuoteLine(projectId: string, materialLineId: string, quoteLineId: string | null) {
  const { db } = await project(projectId);
  if (quoteLineId) {
    const ql = await db.quoteLine.findUnique({ where: { id: quoteLineId } });
    const q = ql && (await db.quote.findUnique({ where: { id: ql.quoteId } }));
    if (!q || q.projectId !== projectId) throw new Error("Quote line not in this bid");
  }
  await db.materialLine.updateMany({ where: { id: materialLineId, projectId }, data: { selectedQuoteLineId: quoteLineId } });
  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function selectSupplierForAll(projectId: string, quoteId: string) {
  const { db } = await project(projectId);
  const lines = await db.quoteLine.findMany({ where: { quoteId, materialLineId: { not: null }, unitPrice: { not: null } } });
  const q = await db.quote.findUnique({ where: { id: quoteId } });
  if (!q || q.projectId !== projectId) return;
  for (const l of lines) await db.materialLine.updateMany({ where: { id: l.materialLineId!, projectId }, data: { selectedQuoteLineId: l.id } });
  revalidatePath(`/projects/${projectId}`, "layout");
}

/** Admin approval: push selected quote prices into the company's material price history. */
export async function approvePriceUpdates(projectId: string) {
  const { db } = await requireAdminCtx();
  const lines = await db.materialLine.findMany({ where: { projectId, selectedQuoteLineId: { not: null }, materialId: { not: null } } });
  let n = 0;
  for (const l of lines) {
    const ql = await db.quoteLine.findUnique({ where: { id: l.selectedQuoteLineId! } });
    const q = ql && (await db.quote.findUnique({ where: { id: ql.quoteId } }));
    if (!ql || !q || ql.unitPrice == null) continue;
    const quotedAt = q.quotedAt ?? q.createdAt;
    await db.material.update({ where: { id: l.materialId! }, data: { unitCost: ql.unitPrice, lastQuotedAt: quotedAt, supplierId: q.supplierId ?? undefined } });
    await db.materialPriceHistory.create({ data: { materialId: l.materialId!, unitCost: ql.unitPrice, source: `Quote from ${q.supplierName}`, supplierId: q.supplierId, quoteId: q.id, quotedAt } as any });
    n++;
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  return n;
}
