import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import crypto from "crypto";

// Tenant-isolated object storage. Every key is namespaced under the company ID
// and every read verifies the key belongs to the caller's company. The local
// disk driver is for development and single-server installs; swap in an
// S3/R2 driver with the same interface for production.

const root = () => path.resolve(process.env.STORAGE_DIR ?? "./storage");

function resolveKey(companyId: string, key: string) {
  if (!/^[a-z0-9]+$/i.test(companyId)) throw new Error("Invalid company id");
  if (!key.startsWith(`${companyId}/`)) throw new Error("Storage key does not belong to this company");
  const full = path.resolve(root(), key);
  if (!full.startsWith(path.resolve(root(), companyId) + path.sep)) throw new Error("Invalid storage key");
  return full;
}

export function newKey(companyId: string, folder: string, filename: string) {
  const safe = filename.replace(/[^\w.\- ]+/g, "_").slice(-120);
  return `${companyId}/${folder}/${crypto.randomUUID()}-${safe}`;
}

export const storage = {
  async put(companyId: string, key: string, data: Buffer | Uint8Array) {
    const full = resolveKey(companyId, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
    return key;
  },
  async append(companyId: string, key: string, data: Buffer | Uint8Array) {
    const full = resolveKey(companyId, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.appendFile(full, data);
  },
  async size(companyId: string, key: string) {
    try { return (await fs.stat(resolveKey(companyId, key))).size; } catch { return 0; }
  },
  async get(companyId: string, key: string) {
    return fs.readFile(resolveKey(companyId, key));
  },
  async readRange(companyId: string, key: string, start: number, end: number) {
    const fh = await fs.open(resolveKey(companyId, key), "r");
    try {
      const buf = Buffer.alloc(end - start + 1);
      await fh.read(buf, 0, buf.length, start);
      return buf;
    } finally { await fh.close(); }
  },
  stream(companyId: string, key: string) {
    return createReadStream(resolveKey(companyId, key));
  },
  async move(companyId: string, from: string, to: string) {
    const dest = resolveKey(companyId, to);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rename(resolveKey(companyId, from), dest);
  },
  async remove(companyId: string, key: string) {
    await fs.rm(resolveKey(companyId, key), { force: true });
  },
};

/**
 * Upload virus scanning hook. Returns CLEAN / INFECTED / NOT_SCANNED.
 * Wire CLAMAV_HOST (clamd INSTREAM) or a cloud scanner here before production.
 */
export async function scanFile(_companyId: string, _key: string): Promise<"CLEAN" | "INFECTED" | "NOT_SCANNED"> {
  return "NOT_SCANNED";
}
