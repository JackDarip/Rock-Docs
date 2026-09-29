import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { resolveQuoteLink } from "@/lib/publicquote";
import { POWERED_BY } from "@/config/brand";

export const dynamic = "force-dynamic";

async function hostOf() {
  const h = await headers();
  return h.get("x-forwarded-host") ?? h.get("host");
}

async function submit(token: string, formData: FormData) {
  "use server";
  const r = await resolveQuoteLink(await hostOf(), token);
  if ("error" in r) redirect(`/q/${token}`);
  const { db, recipient, rfq, lines } = r;
  const num = (v: FormDataEntryValue | null) => { const n = parseFloat(String(v ?? "").replace(/[$,\s]/g, "")); return Number.isFinite(n) ? n : null; };
  const str = (v: FormDataEntryValue | null) => z.string().trim().max(2000).parse(String(v ?? "")) || null;
  const yn = (v: FormDataEntryValue | null) => (v === "Y" ? true : v === "N" ? false : null);
  const quote = await db.quote.create({
    data: {
      projectId: rfq.projectId, rfqId: rfq.id, rfqRevision: rfq.revision, supplierId: recipient.supplierId, supplierName: str(formData.get("supplierName")) ?? recipient.name,
      source: "FORM", status: "REVIEW", quotedAt: new Date(),
      validUntil: formData.get("validUntil") ? new Date(String(formData.get("validUntil"))) : null,
      taxIncluded: yn(formData.get("tax")), freightIncluded: yn(formData.get("freight")),
      minimumOrder: str(formData.get("minimumOrder")), exclusions: str(formData.get("exclusions")), notes: str(formData.get("notes")),
    } as any,
  });
  await db.quoteLine.createMany({
    data: lines.map((l, i) => {
      const price = num(formData.get(`price_${l.lineId}`));
      return {
        quoteId: quote.id, description: l.description, quantity: l.quantity, unit: l.unit, unitPrice: price,
        extended: price != null ? price * l.quantity : null, leadTime: str(formData.get(`lead_${l.lineId}`)), notes: str(formData.get(`notes_${l.lineId}`)),
        materialLineId: l.lineId, matchMethod: "LINE_ID", confidence: "HIGH", sortOrder: i,
      };
    }) as any,
  });
  await db.rfqRecipient.update({ where: { id: recipient.id }, data: { status: "RESPONDED" } });
  redirect(`/q/${token}?sent=1`);
}

export default async function SupplierQuoteForm({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ sent?: string }> }) {
  const { token } = await params;
  const { sent } = await searchParams;
  const r = await resolveQuoteLink(await hostOf(), token);
  const shell = (body: React.ReactNode, company?: { name: string; accentColor: string }) => (
    <main className="min-h-screen bg-paper">
      <header className="bg-night px-6 py-4 text-white"><span className="font-display text-2xl font-bold" style={{ color: company?.accentColor }}>{company?.name ?? "Quote request"}</span></header>
      <div className="mx-auto max-w-5xl p-6">{body}</div>
      <footer className="pb-6 text-center text-xs text-faint">{POWERED_BY}</footer>
    </main>
  );
  if ("error" in r) {
    return shell(<div className="card p-8 text-center"><h1 className="text-2xl font-bold">{r.error === "expired" ? "This quote link has expired" : "Quote link not found"}</h1><p className="mt-2 text-muted">Please contact the estimator who sent you the RFQ for a new link.</p></div>, r.error === "expired" ? r.company : undefined);
  }
  const { company, rfq, project, lines, recipient } = r;
  if (sent) return shell(<div className="card p-8 text-center"><h1 className="text-2xl font-bold">Thank you. Your quote was received.</h1><p className="mt-2 text-muted">{company.name} will review it. Reference RFQ {rfq.number}.</p></div>, company);
  return shell(
    <form action={submit.bind(null, token)} className="space-y-6">
      <div>
        <div className="font-mono text-sm text-brand-600">RFQ {rfq.number}</div>
        <h1 className="text-3xl font-bold">{project?.name}</h1>
        <p className="text-muted">{project?.location}{project?.quoteDueAt ? ` · Quote due ${project.quoteDueAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}` : ""}</p>
      </div>
      <div className="card p-4">
        <label className="label">Your company / contact</label>
        <input name="supplierName" className="input" defaultValue={recipient.name} required />
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="tbl">
          <thead><tr><th>Description</th><th>Spec</th><th className="text-right">Qty</th><th>Unit</th><th>Unit price</th><th>Lead time</th><th>Notes / alternate</th></tr></thead>
          <tbody>{lines.map((l) => (
            <tr key={l.lineId}>
              <td>{l.description}</td><td className="text-xs text-muted">{[l.spec, l.specSection].filter(Boolean).join(" / ")}</td>
              <td className="text-right">{l.quantity.toLocaleString()}</td><td>{l.unit}</td>
              <td><input name={`price_${l.lineId}`} inputMode="decimal" className="input w-28" placeholder="$" /></td>
              <td><input name={`lead_${l.lineId}`} className="input w-28" /></td>
              <td><input name={`notes_${l.lineId}`} className="input" /></td>
            </tr>))}
          </tbody>
        </table>
      </div>
      <div className="card grid gap-4 p-4 md:grid-cols-3">
        <div><label className="label">Quote valid until</label><input type="date" name="validUntil" className="input" /></div>
        <div><label className="label">Sales tax included?</label><select name="tax" className="input"><option value="">—</option><option value="Y">Yes</option><option value="N">No</option></select></div>
        <div><label className="label">Freight / delivery included?</label><select name="freight" className="input"><option value="">—</option><option value="Y">Yes</option><option value="N">No</option></select></div>
        <div><label className="label">Minimum order</label><input name="minimumOrder" className="input" /></div>
        <div className="md:col-span-2"><label className="label">Exclusions</label><input name="exclusions" className="input" /></div>
        <div className="md:col-span-3"><label className="label">Other notes</label><textarea name="notes" className="input" rows={2} /></div>
      </div>
      <button className="btn btn-primary">Submit quote</button>
    </form>, company);
}
