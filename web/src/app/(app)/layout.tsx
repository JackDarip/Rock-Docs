import { redirect } from "next/navigation";
import { requireCtx, destroySession, isPlatformAdmin } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { NavLinks } from "@/components/NavLinks";
import { PRODUCT_NAME, POWERED_BY } from "@/config/brand";

export const dynamic = "force-dynamic";

async function signOut() {
  "use server";
  await destroySession();
  redirect("/login");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, company, isAdmin } = await requireCtx();
  const links = [
    { href: "/", label: "Dashboard", icon: "◧" },
    { href: "/projects", label: "Bids", icon: "▤" },
    { href: "/setup", label: "Company Setup", icon: "⚙" },
    ...(isAdmin ? [{ href: "/setup/users", label: "Team", icon: "☺" }] : []),
    ...(isPlatformAdmin(user) ? [{ href: "/platform", label: "Tenants", icon: "▦" }] : []),
  ];
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-navy-950 text-white print:hidden">
        <div className="border-b border-white/10 px-5 py-5"><Logo light /></div>
        <div className="px-5 py-4">
          <div className="flex items-center gap-2">
            {company.logoPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/api/logo" alt="" className="h-8 w-8 rounded bg-white object-contain p-0.5" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded font-bold" style={{ background: company.accentColor }}>{company.name[0]}</span>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{company.name}</div>
              <div className="text-xs text-mist/70">{user.role === "ADMIN" ? "Admin" : "Estimator"}</div>
            </div>
          </div>
        </div>
        <NavLinks links={links} />
        <div className="mt-auto border-t border-white/10 p-4 text-xs text-mist/70">
          <div className="mb-2 truncate">{user.name}</div>
          <form action={signOut}><button className="text-mist hover:text-white">Sign out</button></form>
          <div className="mt-3">{POWERED_BY}</div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8">
        <div className="mx-auto max-w-[1400px]">{children}</div>
      </main>
      <span className="sr-only">{PRODUCT_NAME}</span>
    </div>
  );
}
