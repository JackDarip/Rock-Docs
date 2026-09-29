import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { prisma } from "./db";

/** Extract the tenant subdomain from a Host header. */
export function subdomainFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0].toLowerCase();
  const root = (process.env.ROOT_DOMAIN ?? "").toLowerCase();
  if (root && hostname.endsWith(`.${root}`)) {
    const sub = hostname.slice(0, -(root.length + 1));
    return sub && !sub.includes(".") ? sub : null;
  }
  if (hostname.endsWith(".localhost")) return hostname.slice(0, -".localhost".length) || null;
  return null;
}

export async function companyForHost(host: string | null | undefined) {
  const sub = subdomainFromHost(host) ?? process.env.DEV_TENANT ?? null;
  if (!sub) return null;
  return prisma.company.findUnique({ where: { subdomain: sub } });
}

/** The company that owns the current request's subdomain. */
export const getTenant = cache(async () => {
  const h = await headers();
  return companyForHost(h.get("x-forwarded-host") ?? h.get("host"));
});
