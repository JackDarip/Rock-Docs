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

export type ScanResult = "CLEAN" | "INFECTED" | "NOT_SCANNED";

/**
 * Upload virus scanning through clamd (CLAMAV_HOST=host[:port], default port 3310)
 * using the INSTREAM command. Without CLAMAV_HOST the file is marked NOT_SCANNED.
 * If the scanner is configured but unreachable, the upload is refused rather than
 * silently accepted.
 */
export async function scanFile(companyId: string, key: string): Promise<ScanResult> {
  const host = process.env.CLAMAV_HOST;
  if (!host) return "NOT_SCANNED";
  const [h, p] = host.split(":");
  const net = await import("net");
  const full = resolveKey(companyId, key);
  return new Promise<ScanResult>((resolve, reject) => {
    const sock = net.createConnection({ host: h, port: Number(p || 3310) });
    let reply = "";
    sock.setTimeout(120_000, () => { sock.destroy(); reject(new Error("Virus scanner timed out")); });
    sock.on("error", (e) => reject(new Error(`Virus scanner unavailable: ${e.message}`)));
    sock.on("data", (d) => { reply += d.toString(); });
    sock.on("end", () => {
      if (/OK\0?\s*$/.test(reply) && !/FOUND/.test(reply)) resolve("CLEAN");
      else if (/FOUND/.test(reply)) resolve("INFECTED");
      else reject(new Error(`Virus scanner error: ${reply.trim() || "no reply"}`));
    });
    sock.on("connect", () => {
      sock.write("zINSTREAM\0");
      const stream = createReadStream(full, { highWaterMark: 64 * 1024 });
      stream.on("data", (chunk) => {
        const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        const len = Buffer.alloc(4); len.writeUInt32BE(buf.length, 0);
        sock.write(len); sock.write(buf);
      });
      stream.on("end", () => sock.write(Buffer.alloc(4)));
      stream.on("error", (e) => { sock.destroy(); reject(e); });
    });
  });
}

/** Store a file and scan it; an infected file is deleted and the call throws. */
export async function putScanned(companyId: string, key: string, data: Buffer | Uint8Array): Promise<ScanResult> {
  await storage.put(companyId, key, data);
  let r: ScanResult;
  try { r = await scanFile(companyId, key); } catch (e) { await storage.remove(companyId, key); throw e; }
  if (r === "INFECTED") { await storage.remove(companyId, key); throw new Error("This file failed the virus scan and was deleted."); }
  return r;
}
