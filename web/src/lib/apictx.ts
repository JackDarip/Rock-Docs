import "server-only";
import { tenantDb } from "./db";
import { getTenant } from "./tenant";
import { getCurrentUser } from "./auth";

/** Route-handler variant of requireCtx: returns null instead of redirecting. */
export async function apiCtx() {
  const company = await getTenant();
  if (!company) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  return { company, user, db: tenantDb(company.id), isAdmin: user.role === "ADMIN" };
}

export const notFound = () => new Response("Not found", { status: 404 });
export const unauthorized = () => new Response("Sign in required", { status: 401 });
export const contentDisposition = (name: string, inline = false) =>
  `${inline ? "inline" : "attachment"}; filename="${name.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'")}"; filename*=UTF-8''${encodeURIComponent(name)}`;
