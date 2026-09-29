import Link from "next/link";
import type { ReactNode } from "react";
import { GLOSSARY } from "@/config/glossary";

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="text-xs font-semibold uppercase tracking-wider text-brand">{eyebrow}</div>}
        <h1 className="text-3xl font-bold text-night">{title}</h1>
        {subtitle && <div className="mt-1 max-w-3xl text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "", title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={`card p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-xl font-bold text-night">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** Every empty screen explains what belongs there and how to fill it. */
export function EmptyState({ title, body, actions }: { title: string; body: ReactNode; actions?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-mist bg-white p-8 text-center">
      <h3 className="text-xl font-bold text-night">{title}</h3>
      <div className="mx-auto mt-2 max-w-xl text-sm text-muted">{body}</div>
      {actions && <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

/** Hover/tap explainer for a technical term. */
export function Term({ k, children }: { k: keyof typeof GLOSSARY | string; children: ReactNode }) {
  const tip = GLOSSARY[k];
  if (!tip) return <>{children}</>;
  return (
    <span className="term" tabIndex={0}>
      {children}
      <span className="term-tip" role="tooltip">{tip}</span>
    </span>
  );
}

export function Flag({ tone = "warn", children, title }: { tone?: "warn" | "ok" | "info" | "muted"; children: ReactNode; title?: string }) {
  return <span className={`flag flag-${tone}`} title={title}>{tone === "warn" && "⚠ "}{tone === "ok" && "✓ "}{children}</span>;
}

export function AiBadge() {
  return <Flag tone="warn" title="Extracted or suggested by AI. A person must confirm it before it's used.">AI draft</Flag>;
}

export function Stat({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="font-display mt-1 text-3xl font-bold text-night">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function ButtonLink({ href, children, variant = "primary", className = "" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost"; className?: string }) {
  return <Link href={href} className={`btn btn-${variant} ${className}`}>{children}</Link>;
}

export function Tabs({ tabs, active }: { tabs: { href: string; label: string; badge?: ReactNode }[]; active: string }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-line">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href}
          className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${active === t.href ? "border-brand text-night" : "border-transparent text-muted hover:text-night"}`}>
          {t.label}{t.badge}
        </Link>
      ))}
    </nav>
  );
}

export const fmtMoney = (n: number | null | undefined, digits = 2) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtNum = (n: number | null | undefined, digits = 2) => (n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits }));
export const fmtDate = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
export const fmtDateTime = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—");
