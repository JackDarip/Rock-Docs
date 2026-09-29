/**
 * Public base URL of a tenant, for links inside emails (quote forms, tracking,
 * decline). Background jobs have no request, so this is derived from config.
 */
export function tenantBaseUrl(company: { subdomain: string }) {
  const root = process.env.ROOT_DOMAIN;
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace("{tenant}", company.subdomain).replace(/\/$/, "");
  if (root && process.env.NODE_ENV === "production") return `https://${company.subdomain}.${root}`;
  return `http://${company.subdomain}.localhost:${process.env.PORT ?? 3000}`;
}
