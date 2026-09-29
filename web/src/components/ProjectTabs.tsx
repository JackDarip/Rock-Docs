"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProjectTabs({ id, badges }: { id: string; badges: Record<string, number> }) {
  const path = usePathname();
  const base = `/projects/${id}`;
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/documents`, label: "Plan room" },
    { href: `${base}/bid-items`, label: "Bid items & takeoff" },
    { href: `${base}/review`, label: "Review", badge: badges.review },
    { href: `${base}/estimate`, label: "Estimate", badge: badges.estimate },
    { href: `${base}/materials`, label: "Material list" },
    { href: `${base}/rfqs`, label: "RFQs" },
    { href: `${base}/quotes`, label: "Quotes", badge: badges.quotes },
    { href: `${base}/compare`, label: "Compare" },
    { href: `${base}/output`, label: "Output" },
  ];
  const active = tabs.slice().reverse().find((t) => (t.href === base ? path === base : path.startsWith(t.href)))?.href;
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-line print:hidden">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${active === t.href ? "border-brand text-night" : "border-transparent text-muted hover:text-night"}`}>
          {t.label}
          {!!t.badge && <span className="rounded-full bg-warn-bg px-1.5 text-xs text-warn">{t.badge}</span>}
        </Link>
      ))}
    </nav>
  );
}
