"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCtx } from "@/lib/auth";

const lineSchema = z.object({ bidItemId: z.string().nullable(), itemNumber: z.string(), description: z.string(), quantity: z.number().nullable(), unit: z.string(), note: z.string().nullable() });
const scopeSchema = z.object({ name: z.string().trim().min(1, "Name the package"), trade: z.string().nullable(), description: z.string().nullable(), lines: z.array(lineSchema) });

/** Save a subcontractor scope package: scope text, related bid items and quantities. */
export async function saveScope(projectId: string, id: string | null, raw: unknown) {
  const { db, user } = await requireCtx();
  if (!(await db.project.findUnique({ where: { id: projectId } }))) return { ok: false as const, error: "Bid not found" };
  const p = scopeSchema.safeParse(raw);
  if (!p.success) return { ok: false as const, error: p.error.issues[0].message };
  const data = { ...p.data, lines: p.data.lines as any };
  const row = id ? await db.scopePackage.update({ where: { id }, data }) : await db.scopePackage.create({ data: { projectId, ...data, createdById: user.id } as any });
  revalidatePath(`/projects/${projectId}/subs`);
  return { ok: true as const, id: row.id };
}

export async function deleteScope(id: string) {
  const { db } = await requireCtx();
  const s = await db.scopePackage.findUnique({ where: { id } });
  if (!s) return;
  await db.scopePackage.delete({ where: { id } });
  revalidatePath(`/projects/${s.projectId}/subs`);
}
