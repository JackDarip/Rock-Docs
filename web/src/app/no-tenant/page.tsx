import { PRODUCT_NAME, PLATFORM_URL } from "@/config/brand";

export default function NoTenant() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-night p-8 text-white">
      <div className="max-w-md text-center">
        <h1 className="font-display text-4xl font-bold">No {PRODUCT_NAME} account here</h1>
        <p className="mt-3 text-mist">This address isn&apos;t connected to a company yet. Check the link your team sent you, or contact <a className="text-brand underline" href={PLATFORM_URL}>Answer AI</a>.</p>
      </div>
    </main>
  );
}
