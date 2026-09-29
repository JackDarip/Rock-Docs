import { redirect } from "next/navigation";
import { PRODUCT_NAME, TAGLINE, PLATFORM_OWNER } from "@/config/brand";
import { getTenant } from "@/lib/tenant";
import { createSession, getCurrentUser, verifyLogin } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { RocketSignIn } from "@/components/RocketSignIn";
import { logoUrl } from "@/lib/logo";

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
  const logo = logoUrl(tenant);
  return (
    <main className="relative grid min-h-dvh grid-cols-1 overflow-hidden bg-night text-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div aria-hidden className="pointer-events-none absolute right-[18%] top-1/3 h-[34rem] w-[34rem] -translate-y-1/2 rounded-full bg-brand/15 blur-3xl" />
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
      <section className="relative flex min-w-0 flex-col items-center justify-center px-4 pb-6 pt-6 sm:px-8 lg:pt-8">
        <div className="mb-3 flex w-full max-w-[600px] items-center justify-between gap-3 lg:justify-center">
          <span className="lg:hidden"><Logo light /></span>
          <div className="flex min-w-0 items-center gap-2">
            {logo && <img src={logo} alt="" className="h-8 w-8 shrink-0 rounded-md bg-white object-contain p-0.5" />}
            <span className="truncate text-xs font-semibold uppercase tracking-wider text-brand-hi">{tenant.name}</span>
          </div>
        </div>
        {error && (
          <p role="alert" className="mb-2 w-full max-w-[600px] rounded-lg border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-center text-sm text-amber-200">
            ⚠ That email and password didn&apos;t match. Try again.
          </p>
        )}
        <form action={login} className="w-full">
          <RocketSignIn error={!!error} />
        </form>
      </section>
    </main>
  );
}
