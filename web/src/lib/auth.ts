import "server-only";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma, tenantDb } from "./db";
import { getTenant } from "./tenant";

export const SESSION_COOKIE = "rd_session";
const SESSION_DAYS = 14;

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 11);
}

export async function createSession(userId: string, companyId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await prisma.session.create({ data: { id: hashToken(token), userId, companyId, expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function verifyLogin(companyId: string, email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { companyId_email: { companyId, email: email.trim().toLowerCase() } },
  });
  if (!user) return null;
  return (await bcrypt.compare(password, user.passwordHash)) ? user : null;
}

/** Current user, only if their session belongs to the tenant on this host. */
export const getCurrentUser = cache(async () => {
  const tenant = await getTenant();
  if (!tenant) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { id: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  if (session.companyId !== tenant.id || session.user.companyId !== tenant.id) return null;
  return session.user;
});

export type Ctx = {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  company: NonNullable<Awaited<ReturnType<typeof getTenant>>>;
  db: ReturnType<typeof tenantDb>;
  isAdmin: boolean;
};

/** Use in every page and action: resolves tenant + user or redirects to login. */
export const requireCtx = cache(async (): Promise<Ctx> => {
  const company = await getTenant();
  if (!company) redirect("/no-tenant");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return { user, company, db: tenantDb(company.id), isAdmin: user.role === "ADMIN" };
});

export async function requireAdminCtx(): Promise<Ctx> {
  const ctx = await requireCtx();
  if (!ctx.isAdmin) throw new Error("Only an Admin can change company setup.");
  return ctx;
}

export function isPlatformAdmin(user: { email: string; isPlatformAdmin: boolean }) {
  const allow = (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return user.isPlatformAdmin || allow.includes(user.email.toLowerCase());
}
