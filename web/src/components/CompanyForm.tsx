"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCompany, uploadLogo, removeLogo } from "@/app/actions/setup";
import { logoUrl } from "@/lib/logo";
import { GLOSSARY } from "@/config/glossary";
import { FilePicker } from "./FilePicker";

type C = Record<string, any>;

function useSaver() {
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [, start] = useTransition();
  const save = (field: string, value: unknown) =>
    start(async () => {
      setMsg((m) => ({ ...m, [field]: "Saving…" }));
      const r = await updateCompany(field, value);
      setMsg((m) => ({ ...m, [field]: r.ok ? "Saved ✓" : `⚠ ${r.error}` }));
    });
  return { msg, save };
}

function Field({ label, field, value, save, msg, type = "text", suffix, term, readOnly, help, rows }: {
  label: string; field: string; value: any; save: (f: string, v: unknown) => void; msg?: string;
  type?: "text" | "number" | "textarea" | "color"; suffix?: string; term?: string; readOnly?: boolean; help?: string; rows?: number;
}) {
  const [v, setV] = useState(value ?? "");
  const commit = () => {
    if (readOnly) return;
    const out = type === "number" ? (v === "" ? null : Number(v)) : v;
    if (out !== value) save(field, out);
  };
  return (
    <div>
      <label className="label">
        {term && GLOSSARY[term] ? <span className="term" tabIndex={0}>{label}<span className="term-tip">{GLOSSARY[term]}</span></span> : label}
      </label>
      <div className="flex items-center gap-2">
        {type === "textarea" ? (
          <textarea className="input" rows={rows ?? 4} value={v} disabled={readOnly} onChange={(e) => setV(e.target.value)} onBlur={commit} />
        ) : type === "color" ? (
          <input type="color" className="h-10 w-16 rounded border border-line" value={v} disabled={readOnly} onChange={(e) => setV(e.target.value)} onBlur={commit} />
        ) : (
          <input className="input" type={type} step="any" value={v} disabled={readOnly} onChange={(e) => setV(e.target.value)} onBlur={commit} />
        )}
        {suffix && <span className="text-sm text-muted">{suffix}</span>}
      </div>
      {help && <p className="mt-1 text-xs text-muted">{help}</p>}
      {msg && <p className={`mt-1 text-xs ${msg.startsWith("⚠") ? "text-warn" : "text-ok"}`}>{msg}</p>}
    </div>
  );
}

export function CompanyForm({ company, readOnly }: { company: C; readOnly: boolean }) {
  const { msg, save } = useSaver();
  const [types, setTypes] = useState<string[]>(company.projectTypes ?? []);
  const f = (field: string, label: string, extra: Partial<Parameters<typeof Field>[0]> = {}) => (
    <Field key={field} field={field} label={label} value={company[field]} save={save} msg={msg[field]} readOnly={readOnly} {...extra} />
  );
  const toggleType = (t: string) => {
    const next = types.includes(t) ? types.filter((x) => x !== t) : [...types, t];
    setTypes(next);
    save("projectTypes", next);
  };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card space-y-4 p-5">
        <h2 className="text-xl font-bold">Identity</h2>
        {f("name", "Company name")}
        {f("rfqPrefix", "RFQ number prefix", { help: "Starts every RFQ number, e.g. IR-2026-0142-AGG-R0." })}
        {f("accentColor", "Accent color", { type: "color", help: "Leads your estimate PDFs and RFQ spreadsheets." })}
        <LogoField initial={logoUrl(company as any)} name={company.name} accent={company.accentColor} readOnly={readOnly} />
        <div>
          <label className="label">Project types you bid</label>
          <div className="flex flex-wrap gap-2">
            {["Federal", "State DOT", "County / City", "Commercial / Private"].map((t) => (
              <button key={t} type="button" disabled={readOnly} onClick={() => toggleType(t)}
                className={`rounded-full border px-3 py-1 text-sm ${types.includes(t) ? "border-brand bg-brand-50 text-brand-600" : "border-line text-muted"}`}>{t}</button>
            ))}
          </div>
        </div>
      </section>
      <section className="card space-y-4 p-5">
        <h2 className="text-xl font-bold">Pricing defaults</h2>
        <p className="text-sm text-muted">Used on every new bid. Each bid can change them for that job only.</p>
        <div className="grid grid-cols-2 gap-4">
          {f("defaultMarkupPct", "Default markup", { type: "number", suffix: "%", term: "markup" })}
          {f("overheadPct", "Overhead allocation", { type: "number", suffix: "%", term: "overhead" })}
          {f("salesTaxPct", "Sales tax on materials", { type: "number", suffix: "%" })}
          {f("bondingPct", "Bond cost", { type: "number", suffix: "% of bid", term: "bond" })}
        </div>
        {f("bondingApproach", "Bonding / insurance approach", { type: "textarea", rows: 2, help: "e.g. 'Bond at 1.2% on jobs over $150k; GL insurance carried in overhead.'" })}
        <div className="grid grid-cols-2 gap-4">
          {f("quoteExpiryDays", "Warn when a material price is older than", { type: "number", suffix: "days" })}
          {f("takeoffVariancePct", "Flag takeoff vs. owner quantity differences over", { type: "number", suffix: "%" })}
          {f("aiMonthlyLimitUsd", "Monthly AI processing limit", { type: "number", suffix: "USD", help: "Document extraction stops when this is reached." })}
        </div>
      </section>
      <section className="card space-y-4 p-5 lg:col-span-2">
        <h2 className="text-xl font-bold">Default RFQ email</h2>
        <p className="text-sm text-muted">Used for &quot;Copy email text&quot; and &quot;Open in my email&quot;. Placeholders: <code>{"{rfq_number}"}</code>, <code>{"{project}"}</code>, <code>{"{category}"}</code>, <code>{"{due}"}</code>, <code>{"{estimator}"}</code>.</p>
        {f("rfqSubject", "Subject line", { help: "e.g. RFQ {rfq_number}: {category} for {project}, due {due}" })}
        {f("rfqBody", "Message body", { type: "textarea", rows: 6 })}
        {f("rfqSignature", "Signature", { type: "textarea", rows: 3 })}
      </section>
    </div>
  );
}

/** Logo upload with a live preview. Shows in the sidebar, on the sign-in page,
 * on supplier quote forms, and on every PDF and RFQ spreadsheet. */
function LogoField({ initial, name, accent, readOnly }: { initial: string | null; name: string; accent: string; readOnly: boolean }) {
  const [url, setUrl] = useState(initial);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div>
      <label className="label">Logo</label>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-white">
          {url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={url} alt={`${name} logo`} className="max-h-full max-w-full object-contain p-1.5" />
            : <span className="flex h-14 w-14 items-center justify-center rounded-lg text-2xl font-bold text-white" style={{ background: accent }}>{name[0]}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <form action={(fd) => start(async () => {
            setMsg("Uploading…");
            const r = await uploadLogo(fd);
            if (r.ok) { setUrl(r.url); setMsg("Saved ✓ Your logo now shows in the sidebar, sign-in page, supplier quote forms, PDFs and RFQ spreadsheets."); router.refresh(); }
            else setMsg(`⚠ ${r.error}`);
          })}>
            <FilePicker name="logo" accept="image/png,image/jpeg" disabled={readOnly || pending} label={url ? "Replace image" : "Choose image"} />
            <div className="mt-2 flex gap-2">
              <button className="btn btn-primary btn-sm" disabled={readOnly || pending}>{pending ? "Uploading…" : "Upload logo"}</button>
              {url && !readOnly && (
                <button type="button" className="btn btn-secondary btn-sm" disabled={pending}
                  onClick={() => start(async () => { await removeLogo(); setUrl(null); setMsg("Logo removed."); router.refresh(); })}>Remove</button>
              )}
            </div>
          </form>
          <p className="mt-1 text-xs text-muted">PNG or JPG, under 3 MB. A square or wide logo on a white or transparent background works best.</p>
          {msg && <p className={`mt-1 text-xs ${msg.startsWith("⚠") ? "text-warn" : "text-ok"}`}>{msg}</p>}
        </div>
      </div>
    </div>
  );
}
