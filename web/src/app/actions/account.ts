"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCtx, hashPassword, hashToken, SESSION_COOKIE } from "@/lib/auth";

const passwordSchema = z.object({
  current: z.string().min(1, "Enter your current password"),
  next: z.string().min(10, "New password must be at least 10 characters"),
  confirm: z.string(),
}).refine((d) => d.next === d.confirm, { message: "The new passwords don't match" })
  .refine((d) => d.next !== d.current, { message: "Choose a password different from the current one" });

/** Any signed-in user can change their own password; other devices are signed out. */
export async function changePassword(formData: FormData) {
  const { user } = await requireCtx();
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (!(await bcrypt.compare(d.current, user.passwordHash))) return { ok: false, error: "Your current password isn't right" };
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(d.next) } });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await prisma.session.deleteMany({ where: { userId: user.id, ...(token ? { NOT: { id: hashToken(token) } } : {}) } });
  return { ok: true };
}
