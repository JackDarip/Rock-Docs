// Creates tenant #1 (Interstate Rock) with one Admin. No rate data is seeded.
import { prisma } from "../src/lib/db";
import { createTenant } from "../src/lib/tenants";

async function main() {
  const existing = await prisma.company.findUnique({ where: { subdomain: "interstaterock" } });
  if (existing) { console.log("Interstate Rock already exists"); return; }
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@interstaterock.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? (process.env.NODE_ENV === "production" ? "" : "change-me-now");
  // Never create a production admin with a default password.
  if (password.length < 10) { console.log("Skipping seed: set SEED_ADMIN_PASSWORD (10+ characters) to create the first admin."); return; }
  await createTenant({ name: "Interstate Rock", subdomain: "interstaterock", rfqPrefix: "IR", admin: { name: "Interstate Rock Admin", email, password } });
  console.log(`Created Interstate Rock. Sign in at interstaterock.<domain> as ${email}`);
}
main().finally(() => prisma.$disconnect());
