// Creates tenant #1 (Interstate Rock) with one Admin. No rate data is seeded.
import { prisma } from "../src/lib/db";
import { createTenant } from "../src/lib/tenants";
import bcrypt from "bcryptjs";

/** Opt-in repair for a first admin created with the wrong email or password. */
async function resetAdmin(companyId: string) {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "jack@theanswerai.com").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (password.length < 10) { console.log("SEED_RESET_ADMIN is on but SEED_ADMIN_PASSWORD is missing or under 10 characters. Nothing changed."); return; }
  const passwordHash = await bcrypt.hash(password, 11);
  const user = await prisma.user.findUnique({ where: { companyId_email: { companyId, email } } });
  if (user) {
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash, role: "ADMIN" } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
  } else {
    await prisma.user.create({ data: { companyId, name: process.env.SEED_ADMIN_NAME ?? "Jack", email, role: "ADMIN", passwordHash } });
  }
  console.log(`SEED_RESET_ADMIN: password set for ${email}. Remove SEED_RESET_ADMIN from the service variables now, or this resets on every boot.`);
}

async function main() {
  const existing = await prisma.company.findUnique({ where: { subdomain: "interstaterock" } });
  if (existing) {
    if (process.env.SEED_RESET_ADMIN === "1") await resetAdmin(existing.id);
    else console.log("Interstate Rock already exists");
    return;
  }
  const email = process.env.SEED_ADMIN_EMAIL ?? "jack@theanswerai.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? (process.env.NODE_ENV === "production" ? "" : "change-me-now");
  // Never create a production admin with a default password.
  if (password.length < 10) { console.log("Skipping seed: set SEED_ADMIN_PASSWORD (10+ characters) to create the first admin."); return; }
  await createTenant({ name: "Interstate Rock", subdomain: "interstaterock", rfqPrefix: "IR", admin: { name: process.env.SEED_ADMIN_NAME ?? "Jack", email, password } });
  console.log(`Created Interstate Rock. Sign in at interstaterock.<domain> as ${email}`);
}
main().finally(() => prisma.$disconnect());
