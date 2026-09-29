"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ links }: { links: { href: string; label: string; icon: string }[] }) {
  const path = usePathname();
  const isActive = (href: string) => {
    if (href === "/") return path === "/";
    if (href === "/setup") return path.startsWith("/setup") && !path.startsWith("/setup/users");
    return path.startsWith(href);
  };
  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {links.map((l) => (
        <Link key={l.href} href={l.href}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition ${isActive(l.href) ? "bg-white/10 text-white shadow-[inset_3px_0_0_#FF6B00]" : "text-mist/80 hover:bg-white/5 hover:text-white"}`}>
          <span className="w-4 text-center opacity-80">{l.icon}</span>{l.label}
        </Link>
      ))}
    </nav>
  );
}
