// Cross-tenant isolation: tries to read another company's records, uploaded
// files, and supplier quote links, and confirms every attempt fails.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execSync } from "child_process";
import crypto from "crypto";
import { prisma, tenantDb } from "@/lib/db";
import { createTenant } from "@/lib/tenants";
import { newKey, storage } from "@/lib/storage";
import { resolveQuoteLink } from "@/lib/publicquote";

let A: { id: string }, B: { id: string };
const run = crypto.randomBytes(3).toString("hex");
const hostA = () => `alpha-${run}.theanswerai.com`;
const hostB = () => `bravo-${run}.theanswerai.com`;
const ids: Record<string, string> = {};

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate", { env: { ...process.env }, stdio: "ignore" });
  process.env.ROOT_DOMAIN = "theanswerai.com";
  A = await createTenant({ name: "Alpha Grading", subdomain: `alpha-${run}`, rfqPrefix: "AG", admin: { name: "A", email: "a@a.com", password: "passwordA123" } });
  B = await createTenant({ name: "Bravo Paving", subdomain: `bravo-${run}`, rfqPrefix: "BP", admin: { name: "B", email: "b@b.com", password: "passwordB123" } });
  const dbA = tenantDb(A.id);
  const p = await dbA.project.create({ data: { name: "Secret Job", jobNumber: "0001" } as any });
  ids.project = p.id;
  ids.material = (await dbA.material.create({ data: { name: "Secret rock", unit: "TON", unitCost: 12.34 } as any })).id;
  ids.supplier = (await dbA.supplier.create({ data: { name: "Alpha's supplier" } as any })).id;
  const key = newKey(A.id, `projects/${p.id}/docs`, "plans.pdf");
  await storage.put(A.id, key, Buffer.from("%PDF-1.4 secret"));
  ids.key = key;
  ids.document = (await dbA.document.create({ data: { projectId: p.id, filename: "plans.pdf", storageKey: key, size: 15, mime: "application/pdf" } as any })).id;
  const rfq = await dbA.rfq.create({ data: { projectId: p.id, categoryCode: "AGG", number: "AG-2026-0001-AGG-R0", lines: [], contentHash: "x" } as any });
  ids.rfq = rfq.id;
  ids.token = crypto.randomBytes(24).toString("base64url");
  await dbA.rfqRecipient.create({ data: { rfqId: rfq.id, name: "Supplier", token: ids.token, tokenExpiresAt: new Date(Date.now() + 864e5) } as any });
  ids.expiredToken = crypto.randomBytes(24).toString("base64url");
  await dbA.rfqRecipient.create({ data: { rfqId: rfq.id, name: "Old", token: ids.expiredToken, tokenExpiresAt: new Date(Date.now() - 1000) } as any });
});

afterAll(async () => { await prisma.$disconnect(); });

describe("record isolation", () => {
  it("tenant B cannot read tenant A records by ID", async () => {
    const dbB = tenantDb(B.id);
    expect(await dbB.project.findUnique({ where: { id: ids.project } })).toBeNull();
    expect(await dbB.material.findFirst({ where: { id: ids.material } })).toBeNull();
    expect(await dbB.supplier.findMany()).toHaveLength(0);
    expect(await dbB.document.findUnique({ where: { id: ids.document } })).toBeNull();
    expect(await dbB.rfq.findUnique({ where: { id: ids.rfq } })).toBeNull();
    expect(await dbB.material.count()).toBe(0);
  });

  it("tenant B cannot update or delete tenant A records", async () => {
    const dbB = tenantDb(B.id);
    await expect(dbB.material.update({ where: { id: ids.material }, data: { unitCost: 0 } })).rejects.toThrow();
    const del = await dbB.material.deleteMany({ where: { id: ids.material } });
    expect(del.count).toBe(0);
    const upd = await dbB.project.updateMany({ where: { id: ids.project }, data: { name: "pwned" } });
    expect(upd.count).toBe(0);
    const still = await tenantDb(A.id).material.findUnique({ where: { id: ids.material } });
    expect(still?.unitCost).toBe(12.34);
  });

  it("tenant B cannot plant records into tenant A by passing companyId", async () => {
    const dbB = tenantDb(B.id);
    const m = await dbB.material.create({ data: { name: "Planted", unit: "EA", companyId: A.id } as any });
    expect(m.companyId).toBe(B.id);
    expect(await tenantDb(A.id).material.findFirst({ where: { name: "Planted" } })).toBeNull();
  });

  it("a filter that tries to widen scope is still pinned to the tenant", async () => {
    const dbB = tenantDb(B.id);
    const rows = await dbB.project.findMany({ where: { OR: [{ companyId: A.id }, { id: ids.project }] } as any });
    expect(rows).toHaveLength(0);
  });

  it("the Company table is not reachable through a tenant client", async () => {
    await expect((tenantDb(B.id) as any).company.findMany()).rejects.toThrow();
  });
});

describe("file isolation", () => {
  it("storage refuses to read a file key owned by another company", async () => {
    await expect(storage.get(B.id, ids.key)).rejects.toThrow(/does not belong/);
    await expect(storage.get(B.id, `${B.id}/../${ids.key}`)).rejects.toThrow();
    expect((await storage.get(A.id, ids.key)).toString()).toContain("secret");
  });

  it("the document lookup used by the file download route returns nothing for another tenant", async () => {
    expect(await tenantDb(B.id).document.findUnique({ where: { id: ids.document } })).toBeNull();
  });
});

describe("RFQ link isolation", () => {
  it("a supplier link works only on its own company's subdomain", async () => {
    const own = await resolveQuoteLink(hostA(), ids.token);
    expect("error" in own).toBe(false);
    const other = await resolveQuoteLink(hostB(), ids.token);
    expect(other).toMatchObject({ error: "not_found" });
  });

  it("expired and guessed links fail", async () => {
    expect(await resolveQuoteLink(hostA(), ids.expiredToken)).toMatchObject({ error: "expired" });
    expect(await resolveQuoteLink(hostA(), "x".repeat(32))).toMatchObject({ error: "not_found" });
    expect(await resolveQuoteLink(hostA(), "")).toMatchObject({ error: "not_found" });
  });
});
