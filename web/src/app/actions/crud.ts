"use server";

import { revalidatePath } from "next/cache";
import { requireCtx } from "@/lib/auth";
import { ENTITIES, type EntityName } from "@/lib/entities";

export type SaveResult = { ok: true; id: string; row: Record<string, unknown> } | { ok: false; error: string };

async function audit(ctx: Awaited<ReturnType<typeof requireCtx>>, action: string, target: string, detail?: unknown) {
  await ctx.db.auditLog.create({ data: { userId: ctx.user.id, action, target, detail: detail as any } as any });
}

export async function saveRow(entity: EntityName, id: string | null, data: Record<string, unknown>, extra?: { projectId?: string }): Promise<SaveResult> {
  const ctx = await requireCtx();
  const def = ENTITIES[entity];
  if (!def) return { ok: false, error: "Unknown table" };
  if (def.admin && !ctx.isAdmin) return { ok: false, error: "Only an Admin can change company setup." };
  const schema = id ? (def.schema as any).partial() : def.schema;
  const parsed = schema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i: any) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const values = parsed.data as Record<string, unknown>;
  const delegate = (ctx.db as any)[def.model];

  try {
    if (entity === "contact" && values.supplierId) {
      const sup = await ctx.db.supplier.findUnique({ where: { id: values.supplierId as string } });
      if (!sup) return { ok: false, error: "Supplier not found" };
    }
    if (entity === "quoteLine" && values.quoteId) {
      const q = await ctx.db.quote.findUnique({ where: { id: values.quoteId as string } });
      if (!q) return { ok: false, error: "Quote not found" };
    }
    if (entity === "material" && id && "unitCost" in values) {
      const prev = await ctx.db.material.findUnique({ where: { id } });
      if (prev && values.unitCost != null && prev.unitCost !== values.unitCost) {
        if (!("lastQuotedAt" in values) || values.lastQuotedAt == null) values.lastQuotedAt = new Date();
        await ctx.db.materialPriceHistory.create({ data: { materialId: id, unitCost: values.unitCost as number, source: "Manual entry", quotedAt: values.lastQuotedAt as Date } as any });
      }
    }
    let row;
    if (id) {
      row = await delegate.update({ where: { id }, data: values });
    } else {
      const createData: Record<string, unknown> = { ...values };
      if ((def as any).project) {
        if (!extra?.projectId) return { ok: false, error: "Missing project" };
        const p = await ctx.db.project.findUnique({ where: { id: extra.projectId } });
        if (!p) return { ok: false, error: "Project not found" };
        createData.projectId = p.id;
        if (entity === "materialLine") createData.manual = true;
      }
      if (entity === "material" && createData.unitCost != null && !createData.lastQuotedAt) createData.lastQuotedAt = new Date();
      row = await delegate.create({ data: createData });
    }
    await audit(ctx, id ? "update" : "create", `${entity}:${row.id}`, values);
    return { ok: true, id: row.id, row: JSON.parse(JSON.stringify(row)) };
  } catch (e: any) {
    if (e?.code === "P2025") return { ok: false, error: "Record not found" };
    if (e?.code === "P2002") return { ok: false, error: "That code or name is already used" };
    return { ok: false, error: e?.message ?? "Save failed" };
  }
}

export async function deleteRow(entity: EntityName, id: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireCtx();
  const def = ENTITIES[entity];
  if (def.admin && !ctx.isAdmin) return { ok: false, error: "Only an Admin can change company setup." };
  const delegate = (ctx.db as any)[def.model];
  const res = await delegate.deleteMany({ where: { id } });
  if (entity === "supplier") await ctx.db.contact.deleteMany({ where: { supplierId: id } });
  await audit(ctx, "delete", `${entity}:${id}`);
  revalidatePath("/", "layout");
  return { ok: res.count > 0 };
}
