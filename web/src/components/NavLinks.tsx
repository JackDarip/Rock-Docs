"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";

/** Main sidebar navigation. When a bid is open, its sections render under "Bids" (see ProjectNav). */
export function NavLinks({ links }: { links: { href: string; label: string; icon: string }[] }) {
  const path = usePathname();
  const isActive = (href: string) => {
    if (href === "/") return path === "/";
    if (href === "/setup") return path.startsWith("/setup") && !path.startsWith("/setup/users");
    return path.startsWith(href);
  };
  return (
    <nav className="flex flex-col gap-0.5 px-3" aria-label="Main">
      {links.map((l) => (
        <div key={l.href}>
          <Link href={l.href} aria-current={isActive(l.href) ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-brand-hi ${isActive(l.href) ? "bg-white/10 text-white shadow-[inset_3px_0_0_#FF6B00]" : "text-mist/80 hover:bg-white/5 hover:text-white"}`}>
            <Icon name={l.icon} className={isActive(l.href) ? "text-brand-hi" : "opacity-80"} />
            {l.label}
          </Link>
          {l.href === "/projects" && <div id="project-nav-slot" />}
        </div>
      ))}
    </nav>
  );
}
