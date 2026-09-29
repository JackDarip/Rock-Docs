import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Raw client. Only tenant bootstrap code (host -> company, sessions, platform
// admin, public supplier links) may use this directly. Everything else goes
// through tenantDb().
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const UNSCOPED_MODELS = new Set(["Company"]);
const WHERE_OPS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany",
  "count", "aggregate", "groupBy", "update", "updateMany", "delete", "deleteMany",
  "updateManyAndReturn",
]);

/**
 * Tenant-scoped Prisma client. Every query on a tenant table gets
 * `companyId` forced into its filter and every write gets it forced into its
 * data, so a record ID from another tenant simply doesn't exist here.
 */
export function tenantDb(companyId: string) {
  if (!companyId) throw new Error("tenantDb requires a companyId");
  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (UNSCOPED_MODELS.has(model)) {
            throw new Error(`${model} is not accessible through the tenant client`);
          }
          const a = (args ?? {}) as Record<string, any>;
          if (WHERE_OPS.has(operation)) {
            a.where = { ...(a.where ?? {}), companyId };
          }
          if (operation === "create") {
            a.data = { ...(a.data ?? {}), companyId };
          }
          if (operation === "createMany" || operation === "createManyAndReturn") {
            const rows = Array.isArray(a.data) ? a.data : [a.data];
            a.data = rows.map((r: any) => ({ ...r, companyId }));
          }
          if (operation === "update" || operation === "updateMany") {
            if (a.data && "companyId" in a.data) delete a.data.companyId;
          }
          if (operation === "upsert") {
            a.where = { ...(a.where ?? {}), companyId };
            a.create = { ...(a.create ?? {}), companyId };
            if (a.update && "companyId" in a.update) delete a.update.companyId;
          }
          return query(a);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
