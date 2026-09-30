"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

function sections(id: string, badges: Record<string, number> = {}) {
  const base = `/projects/${id}`;
  return [
    { href: base, label: "Overview" },
    { href: `${base}/documents`, label: "Plan room" },
    { href: `${base}/addenda`, label: "Addenda", badge: badges.addenda },
    { href: `${base}/bid-items`, label: "Bid items & takeoff", also: `${base}/viewer` },
    { href: `${base}/earthwork`, label: "Earthwork" },
    { href: `${base}/specs`, label: "Specifications", badge: badges.specs },
    { href: `${base}/review`, label: "Review", badge: badges.review },
    { href: `${base}/estimate`, label: "Estimate", badge: badges.estimate },
    { href: `${base}/materials`, label: "Material list" },
    { href: `${base}/rfqs`, label: "RFQs" },
    { href: `${base}/subs`, label: "Sub scopes" },
    { href: `${base}/quotes`, label: "Quotes", badge: badges.quotes },
    { href: `${base}/compare`, label: "Compare" },
    { href: `${base}/output`, label: "Output" },
  ] as { href: string; label: string; badge?: number; also?: string }[];
}

function activeSection(id: string, path: string) {
  const base = `/projects/${id}`;
  return sections(id).slice().reverse().find((t) => (t.href === base ? path === base : path.startsWith(t.href) || (t.also && path.startsWith(t.also))));
}

/** Breadcrumb for the page header: Bids › Job 0001 › Estimate. */
export function SectionCrumb({ id, jobNumber }: { id: string; jobNumber: string }) {
  const path = usePathname();
  const current = activeSection(id, path);
  const sub = path.endsWith("/viewer") ? "Plan viewer" : path.includes("/quotes/") ? "Quote review" : null;
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
      <Link href="/projects" className="text-muted hover:text-night">Bids</Link>
      <span className="text-faint">›</span>
      <Link href={`/projects/${id}`} className="text-muted hover:text-night">Job {jobNumber}</Link>
      {current && <><span className="text-faint">›</span><span className={sub ? "text-muted" : "text-brand-600"}>{sub ? <Link href={current.href} className="hover:text-night">{current.label}</Link> : current.label}</span></>}
      {sub && <><span className="text-faint">›</span><span className="text-brand-600">{sub}</span></>}
    </nav>
  );
}

/**
 * A bid's sections, shown in the left sidebar under "Bids" (rendered into the
 * sidebar's slot so the page itself has no tab bar across the top).
 */
export function ProjectTabs({ id, name, badges }: { id: string; name: string; badges: Record<string, number> }) {
  const path = usePathname();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setSlot(document.getElementById("project-nav-slot")); }, []);
  const tabs = sections(id, badges);
  const active = activeSection(id, path)?.href;
  if (!slot) return null;
  return createPortal(
    <div className="mb-2 ml-5 mt-1 border-l border-white/10 pl-2">
      <div className="truncate px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-mist/60" title={name}>{name}</div>
      <ul className="flex flex-col gap-px">
        {tabs.map((t) => (
          <li key={t.href}>
            <Link href={t.href} aria-current={active === t.href ? "page" : undefined}
              className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[13px] transition focus-visible:outline-2 focus-visible:outline-brand-hi ${active === t.href ? "bg-white/10 font-semibold text-white" : "text-mist/75 hover:bg-white/5 hover:text-white"}`}>
              <span className="truncate">{t.label}</span>
              {!!t.badge && <span className="rounded-full bg-amber-400/20 px-1.5 text-[11px] font-semibold text-amber-300" title="Needs attention">{t.badge}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>,
    slot,
  );
}
