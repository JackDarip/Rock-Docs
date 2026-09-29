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
  companyId: string; feature: string; refId?: string; pdf?: Buffer; text?: string; prompt: string; schema: T;
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
        ...(opts.pdf ? [{ type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: opts.pdf.toString("base64") } }] : []),
        ...(opts.text ? [{ type: "text" as const, text: `<source>\n${opts.text}\n</source>` }] : []),
        { type: "text" as const, text: opts.prompt },
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

export function extractQuoteFromText(companyId: string, text: string, refId?: string) {
  return extract({ companyId, feature: "email_quote", refId, text, prompt: QUOTE_PROMPT.replace("supplier's quote (it may be scanned)", "supplier's quote, pasted or forwarded as email text,") + "\n- Use page 1 for every line.", schema: SupplierQuoteSchema });
}

// ---------- Specifications ----------

export const SpecSchema = z.object({
  requirements: z.array(z.object({
    item_number: z.string().nullable().describe("Bid item this requirement applies to, if known"),
    spec_section: z.string().nullable(),
    material: z.string().describe("The material or product, e.g. 'Untreated base course', 'PVC water pipe'"),
    requirement: z.string().describe("What is required, quoted or closely paraphrased: gradation, class, grade, strength, standard (e.g. 'AWWA C900 DR18, pressure class 235')"),
    page: z.number().int(),
    confidence: z.enum(["high", "low"]),
  })),
  missing_standards: z.array(z.object({
    item_number: z.string().nullable(),
    reference: z.string().describe("The standard specification cited, e.g. 'UDOT Standard Specifications Section 02721' or 'APWA Section 32 11 23'"),
    note: z.string().nullable(),
  })).describe("Standard specifications that are cited but whose text is NOT in the pages provided"),
});

export function extractSpecRequirements(companyId: string, pdf: Buffer, bidItems: { itemNumber: string; description: string; specSection: string | null }[], refId?: string) {
  const list = bidItems.map((b) => `${b.itemNumber}: ${b.description}${b.specSection ? ` (spec ${b.specSection})` : ""}`).join("\n");
  return extract({
    companyId, feature: "spec_requirements", refId, pdf, schema: SpecSchema,
    prompt: `You are reading construction specifications for an estimator who must tell suppliers exactly what to quote.
Bid items on this job:
${list}

For each bid item, find the material requirements in these pages: aggregate type and gradation, asphalt binder grade and mix, pipe material/class/pressure rating/joint, concrete strength and mix, rebar grade, geotextile type, bedding and backfill material, compaction requirements that affect material, etc. Tie each to its bid item and spec section.
Rules:
- Quote or closely paraphrase; never invent values. "page" is the 1-based page within the pages you were given.
- If a requirement points to a standard specification (state DOT, APWA, city standards) whose text is not in these pages, list it under missing_standards.
- Mark confidence "low" when the link to a bid item is a guess.`,
  });
}

// ---------- AI-assisted measurement ----------

export const MeasureSchema = z.object({
  suggestions: z.array(z.object({
    kind: z.enum(["LINEAR", "COUNT", "AREA"]),
    label: z.string().describe("e.g. '8\" PVC sewer', 'Manhole', 'Type II asphalt paving'"),
    quantity: z.number(),
    unit: z.string().describe("LF, EA, SF or SY"),
    anchors: z.array(z.number().int()).describe("Indexes of the text items (from the list) that this suggestion is read from or located at"),
    evidence: z.string().describe("The callout or note that supports it, e.g. 'STA 10+00 to 14+50, 450 LF 8\" PVC @ 0.40%'"),
    confidence: z.enum(["high", "low"]),
  })),
});

export function suggestMeasurements(companyId: string, pdf: Buffer, textItems: { i: number; x: number; y: number; s: string }[], refId?: string) {
  const list = textItems.map((t) => `${t.i}\t${Math.round(t.x)},${Math.round(t.y)}\t${t.s}`).join("\n");
  return extract({
    companyId, feature: "ai_measure", refId, pdf, schema: MeasureSchema,
    text: `Text items on this sheet (index, x,y in PDF points from bottom-left, text):\n${list}`,
    prompt: `You are helping a heavy civil estimator take off quantities from one plan sheet (plan & profile, utility plan, paving plan, or structure plan).
Suggest quantities an estimator would measure, using only what the sheet itself shows:
- pipe run lengths by size and material (from profile callouts, stationing differences, or length labels)
- counts of structures: manholes, inlets/catch basins, valves, hydrants, fittings
- paved areas by section type, when the sheet labels an area or dimensions
Rules:
- Every suggestion must cite the text it came from (evidence) and the indexes of those text items (anchors) so it can be pinned on the sheet.
- Derive lengths only from printed stations or lengths; never estimate by eye. Show the arithmetic in evidence when you subtract stations.
- These are drafts a human will accept, edit or reject. Mark confidence "low" whenever you had to interpret.
- If nothing measurable is on the sheet, return an empty list.`,
  });
}

// ---------- Historical job costs ----------

export const JobCostSchema = z.object({
  job_name: z.string().nullable(),
  job_number: z.string().nullable(),
  lines: z.array(z.object({
    activity: z.string().describe("Cost code / activity description"),
    quantity: z.number().nullable(),
    unit: z.string().nullable(),
    estimated_cost: z.number().nullable(),
    actual_cost: z.number().nullable(),
    estimated_hours: z.number().nullable(),
    actual_hours: z.number().nullable().describe("Labor hours actually spent"),
    equipment: z.string().nullable(),
    materials: z.string().nullable(),
    page: z.number().int(),
    confidence: z.enum(["high", "low"]),
  })),
});

const JOB_COST_PROMPT = `You are reading a construction company's job cost report or bid estimate for a finished job, so its real production and costs can calibrate future estimates.
Extract every activity / cost-code line: description, quantity installed and unit, estimated (budget) cost, actual cost, estimated and actual labor hours, and equipment or materials named on the line.
Rules:
- Copy numbers exactly; use null when not shown. Do not compute totals.
- Skip subtotal, total, header and page-footer lines.
- Mark confidence "low" for anything hard to read or where columns were ambiguous.
- "page" is the 1-based page number within the document (1 for spreadsheets).`;

export function extractJobCosts(companyId: string, input: { pdf?: Buffer; text?: string }, refId?: string) {
  return extract({ companyId, feature: "job_cost", refId, ...input, prompt: JOB_COST_PROMPT, schema: JobCostSchema });
}

// ---------- Setup documents ----------

export const WageSchema = z.object({
  determination_number: z.string().nullable(),
  effective_date: z.string().nullable().describe("ISO date YYYY-MM-DD"),
  counties: z.array(z.string()),
  rates: z.array(z.object({
    classification: z.string().describe("e.g. 'Operator: Backhoe/Excavator', 'Laborer: Pipelayer'"),
    base_rate: z.number().nullable(),
    fringe: z.number().nullable(),
    county: z.string().nullable(),
    page: z.number().int(),
    confidence: z.enum(["high", "low"]),
  })),
});

export function extractWageDetermination(companyId: string, pdf: Buffer, refId?: string) {
  return extract({
    companyId, feature: "wage_determination", refId, pdf, schema: WageSchema,
    prompt: `This is a prevailing wage / Davis-Bacon wage determination. Extract every craft classification with its base hourly rate and fringe benefits per hour, the counties it covers, the determination number and effective date.
Rules: copy rates exactly; if fringe is stated as a percentage or formula, put null and explain nothing. Mark confidence "low" for anything unclear. "page" is 1-based.`,
  });
}

export const EquipmentReportSchema = z.object({
  items: z.array(z.object({
    name: z.string(), type: z.string().nullable(),
    ownership_hourly: z.number().nullable(), operating_hourly: z.number().nullable(),
    standby_hourly: z.number().nullable(), mobilization_cost: z.number().nullable(),
    page: z.number().int(), confidence: z.enum(["high", "low"]),
  })),
});

export function extractEquipmentReport(companyId: string, input: { pdf?: Buffer; text?: string }, refId?: string) {
  return extract({
    companyId, feature: "equipment_report", refId, ...input, schema: EquipmentReportSchema,
    prompt: `This is an equipment cost report (internal cost report, rental rate sheet, or a rate book like the USACE EP 1110-1-8 or Caltrans rates). Extract each machine with hourly ownership cost, hourly operating cost, standby rate, and mobilization cost per move when shown.
Rules: copy numbers exactly; convert only when the report plainly gives a monthly or daily rate AND the hours basis (show nothing otherwise, use null). Mark confidence "low" when unclear. "page" is 1-based (1 for spreadsheets).`,
  });
}
