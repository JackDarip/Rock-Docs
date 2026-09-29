import { redirect } from "next/navigation";
import { PRODUCT_NAME, TAGLINE, PLATFORM_OWNER } from "@/config/brand";
import { getTenant } from "@/lib/tenant";
import { createSession, getCurrentUser, verifyLogin } from "@/lib/auth";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

async function login(formData: FormData) {
  "use server";
  const tenant = await getTenant();
  if (!tenant) redirect("/no-tenant");
  const user = await verifyLogin(tenant.id, String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  if (!user) redirect("/login?error=1");
  await createSession(user.id, tenant.id);
  redirect("/");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const tenant = await getTenant();
  if (!tenant) redirect("/no-tenant");
  if (await getCurrentUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="relative grid min-h-screen overflow-hidden bg-night text-white lg:grid-cols-2">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-brand/15 blur-3xl" />
      <section className="relative hidden flex-col justify-between p-12 lg:flex">
        <Logo light />
        <div>
          <h1 className="font-display text-6xl font-extrabold leading-none">
            Bid it right.<br /><span className="text-brand">Price it real.</span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-mist">{TAGLINE} Takeoff, crews, supplier quotes and bid output, all traced back to the sheet and the quote they came from.</p>
        </div>
        <p className="text-sm text-mist/70">{PRODUCT_NAME} by {PLATFORM_OWNER}</p>
      </section>
      <section className="relative flex items-center justify-center p-8">
        <form action={login} className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><Logo light /></div>
          <div className="text-xs font-semibold uppercase tracking-wider text-brand">{tenant.name}</div>
          <h2 className="mb-8 text-4xl font-bold text-white">Sign in to {PRODUCT_NAME}</h2>
          {error && <p className="mb-4 rounded-lg border border-warn-line/40 bg-warn/15 p-3 text-sm text-amber-200">That email and password didn&apos;t match. Try again.</p>}
          <label className="label !text-mist" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input mb-5 !border-navy-700 !bg-navy-950 !text-white" />
          <label className="label !text-mist" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input mb-8 !border-navy-700 !bg-navy-950 !text-white" />
          <button className="btn btn-primary w-full justify-center py-3">Sign in</button>
        </form>
      </section>
    </main>
  );
}
