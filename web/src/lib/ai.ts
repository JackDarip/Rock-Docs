import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { PDFDocument } from "pdf-lib";
import { prisma } from "./db";

// AI assists, humans verify: everything returned from here is stored as a
// DRAFT that must be confirmed in a review table before it can feed an estimate.

export const AI_MODEL = "claude-opus-5-5";
const PRICE_IN_PER_MTOK = 4;
const PRICE_OUT_PER_MTOK = 20;
// Rough planning numbers for the "before you run it" estimate shown in the UI.
const EST_INPUT_TOKENS_PER_PAGE = 2600;
const EST_OUTPUT_TOKENS_PER_PAGE = 900;

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export function estimateAiCost(pages: number) {
  const usd = (pages * EST_INPUT_TOKENS_PER_PAGE * PRICE_IN_PER_MTOK + pages * EST_OUTPUT_TOKENS_PER_PAGE * PRICE_OUT_PER_MTOK) / 1e6;
  return { usd: Math.round(usd * 100) / 100, seconds: Math.max(20, Math.round(pages * 6)) };
}

export async function aiSpendThisMonth(companyId: string) {
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const agg = await prisma.aiUsage.aggregate({ where: { companyId, createdAt: { gte: start } }, _sum: { costUsd: true } });
  return agg._sum.costUsd ?? 0;
}

export async function assertAiBudget(companyId: string, estimateUsd: number) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const spent = await aiSpendThisMonth(companyId);
  if (spent + estimateUsd > company.aiMonthlyLimitUsd) {
    throw new Error(`This would exceed your monthly AI processing limit ($${company.aiMonthlyLimitUsd}). An Admin can raise it in Company Setup.`);
  }
}

/** Copy only the chosen pages (1-based) into a smaller PDF before sending. */
export async function slicePdf(buf: Buffer, pages?: number[]) {
  if (!pages?.length) return buf;
  const src = await PDFDocument.load(buf, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const idx = pages.map((p) => p - 1).filter((i) => i >= 0 && i < src.getPageCount());
  const copied = await out.copyPages(src, idx);
  copied.forEach((p) => out.addPage(p));
  return Buffer.from(await out.save());
}

// ---------- Schemas ----------

export const BidScheduleSchema = z.object({
  project_name: z.string().nullable(),
  owner: z.string().nullable(),
  project_number: z.string().nullable(),
  items: z.array(z.object({
    item_number: z.string(),
    description: z.string(),
    spec_section: z.string().nullable(),
    unit: z.string(),
    quantity: z.number().nullable(),
    page: z.number().int(),
    confidence: z.enum(["high", "low"]),
    note: z.string().nullable(),
  })),
});
export type BidScheduleExtraction = z.infer<typeof BidScheduleSchema>;

export const SupplierQuoteSchema = z.object({
  supplier_name: z.string().nullable(),
  quote_number: z.string().nullable(),
  quote_date: z.string().nullable().describe("ISO date YYYY-MM-DD if shown"),
  valid_until: z.string().nullable().describe("ISO date YYYY-MM-DD if shown or derivable"),
  tax_included: z.boolean().nullable(),
  freight_included: z.boolean().nullable(),
  minimum_order: z.string().nullable(),
  exclusions: z.string().nullable(),
  notes: z.string().nullable(),
  total: z.number().nullable(),
  lines: z.array(z.object({
    section: z.string().nullable().describe("Heading the line sits under, e.g. 'BID ITEM 5 - PUMP STATION / METER VAULT'"),
    line_ref: z.string().nullable().describe("Supplier line or sequence number"),
    description: z.string(),
    quantity: z.number().nullable(),
    unit: z.string().nullable(),
    unit_price: z.number().nullable(),
    extended: z.number().nullable(),
    is_alternate: z.boolean(),
    confidence: z.enum(["high", "low"]),
    page: z.number().int(),
  })),
});
export type SupplierQuoteExtraction = z.infer<typeof SupplierQuoteSchema>;

const BID_SCHEDULE_PROMPT = `You are reading a public works / heavy civil bid package for a construction estimator.
Extract the owner's bid schedule (bid form / schedule of values) exactly as written: every bid item number, description, spec section reference if given, unit of measure, and the owner's estimated quantity.
Rules:
- Copy item numbers, units and quantities exactly. Never compute, round, or invent a quantity. If a quantity is blank, illegible, or "LS" with no number, use null (or 1 for a lump sum that states 1).
- Mark confidence "low" for anything hard to read (scans, handwriting, cut-off cells) or where you had to interpret layout. Use "high" only when the value is clearly printed.
- "page" is the 1-based page number within the document you were given.
- Include alternates and additive/deductive items; put "Alternate" in note.
- If there is no bid schedule in the document, return an empty items list.`;

const QUOTE_PROMPT = `You are reading a construction material supplier's quote (it may be scanned) so an estimator can compare suppliers.
Extract every priced line exactly as printed: description, quantity, unit, unit price, extended price, and the section heading it appears under (for example the owner's bid item or area such as "BID ITEM 5 / METER VAULT").
Rules:
- Copy numbers exactly. Do not compute missing prices. Use null when a value is not shown.
- Skip note-only lines, page headers/footers and subtotal lines, but capture exclusions, validity period, freight and tax terms in the header fields.
- If validity is stated relative to the quote date (e.g. "valid for 24 hours" or "30 days"), compute valid_until from the quote date.
- is_alternate is true when the line is offered as an alternate/substitute.
- Mark confidence "low" for anything hard to read.
- "page" is the 1-based page number within the document you were given.`;

// ---------- Calls ----------

async function extract<T extends z.ZodTypeAny>(opts: {
  companyId: string; feature: string; refId?: string; pdf: Buffer; prompt: string; schema: T;
}): Promise<z.infer<T>> {
  if (!aiEnabled()) throw new Error("AI extraction is not configured (set ANTHROPIC_API_KEY). You can still enter or import values manually.");
  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: AI_MODEL,
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as any,
    output_config: { effort: "medium", format: { type: "json_schema", schema: z.toJSONSchema(opts.schema, { target: "draft-7" }) as any } },
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: opts.pdf.toString("base64") } },
        { type: "text", text: opts.prompt },
      ],
    }],
  });
  const msg = await stream.finalMessage();
  const u = msg.usage;
  const inTok = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  await prisma.aiUsage.create({
    data: {
      companyId: opts.companyId, feature: opts.feature, model: msg.model, refId: opts.refId,
      inputTokens: inTok, outputTokens: u.output_tokens,
      costUsd: (inTok * PRICE_IN_PER_MTOK + u.output_tokens * PRICE_OUT_PER_MTOK) / 1e6,
    },
  });
  if (msg.stop_reason === "refusal") throw new Error("The AI declined to process this document. Enter the values manually.");
  if (msg.stop_reason === "max_tokens") throw new Error("Document too large to extract in one pass. Select fewer pages and try again.");
  const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  return opts.schema.parse(JSON.parse(text));
}

export function extractBidSchedule(companyId: string, pdf: Buffer, refId?: string) {
  return extract({ companyId, feature: "bid_schedule", refId, pdf, prompt: BID_SCHEDULE_PROMPT, schema: BidScheduleSchema });
}

export function extractSupplierQuote(companyId: string, pdf: Buffer, refId?: string) {
  return extract({ companyId, feature: "supplier_quote", refId, pdf, prompt: QUOTE_PROMPT, schema: SupplierQuoteSchema });
}
