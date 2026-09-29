import "server-only";
import crypto from "node:crypto";

// AES-256-GCM for secrets at rest (mailbox OAuth tokens). Key from APP_SECRET.
function key() {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) throw new Error("APP_SECRET (32+ characters) is not configured");
  return crypto.createHash("sha256").update(s).digest();
}

export const hasAppSecret = () => (process.env.APP_SECRET ?? "").length >= 32;

export function encrypt(plain: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(token: string) {
  const [iv, tag, enc] = token.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString("base64url");
