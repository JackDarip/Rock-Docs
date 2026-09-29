import { redirect } from "next/navigation";
import { requireCtx, destroySession, isPlatformAdmin } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { NavLinks } from "@/components/NavLinks";
import { Icon } from "@/components/Icon";
import { PRODUCT_NAME, POWERED_BY } from "@/config/brand";
import { logoUrl } from "@/lib/logo";

export const dynamic = "force-dynamic";

async function signOut() {
  "use server";
  await destroySession();
  redirect("/login");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, company, isAdmin, db } = await requireCtx();
  const unread = await db.notification.count({ where: { userId: user.id, readAt: null } });
  const links = [
    { href: "/", label: "Dashboard", icon: "dashboard" },
    { href: "/projects", label: "Bids", icon: "bids" },
    { href: "/jobs", label: "Past jobs", icon: "history" },
    { href: "/notifications", label: "Notifications", icon: "bell", badge: unread },
    { href: "/setup", label: "Company Setup", icon: "setup" },
    ...(isAdmin ? [{ href: "/setup/users", label: "Team", icon: "team" }] : []),
    ...(isPlatformAdmin(user) ? [{ href: "/platform", label: "Tenants", icon: "tenants" }] : []),
  ];
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-navy-950 text-white print:hidden">
        <div className="border-b border-white/10 px-5 py-4"><Logo light /></div>
        <div className="flex items-center gap-2.5 px-5 py-3">
          {company.logoPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl(company)!} alt="" className="h-9 w-9 rounded-md bg-white object-contain p-0.5" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-md font-bold" style={{ background: company.accentColor }}>{company.name[0]}</span>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{company.name}</div>
            <div className="text-xs text-mist/70">{user.role === "ADMIN" ? "Admin" : "Estimator"}</div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          <NavLinks links={links} />
        </div>
        <div className="border-t border-white/10 px-5 py-3 text-xs text-mist/70">
          <div className="truncate text-sm text-mist" title={user.name}>{user.name}</div>
          <div className="truncate" title={user.email}>{user.email}</div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <form action={signOut}>
              <button className="-ml-2 flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-semibold text-mist hover:bg-white/5 hover:text-white"><Icon name="signout" size={16} />Sign out</button>
            </form>
            <span className="whitespace-nowrap text-[11px] text-mist/50">{POWERED_BY}</span>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8">
        <div className="mx-auto max-w-[1400px]">{children}</div>
      </main>
      <span className="sr-only">{PRODUCT_NAME}</span>
    </div>
  );
}
