// Run from a shell on the service (Railway Console).
//   npm run admin:reset                      -> lists the sign-in emails for the tenant
//   NEW_PASSWORD='...' npm run admin:reset -- you@example.com   -> sets that user's password
// The password comes from the environment so it never lands on the command line.
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";

async function main() {
  const subdomain = process.env.TENANT_SUBDOMAIN ?? "interstaterock";
  const company = await prisma.company.findUnique({ where: { subdomain } });
  if (!company) { console.log(`No company with subdomain "${subdomain}".`); return; }

  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    const users = await prisma.user.findMany({ where: { companyId: company.id }, select: { email: true, role: true } });
    console.log(`Sign-in emails for ${company.name}:`);
    for (const u of users) console.log(`  ${u.email}  (${u.role})`);
    console.log("To reset: NEW_PASSWORD='...' npm run admin:reset -- <email>");
    return;
  }

  const password = process.env.NEW_PASSWORD ?? "";
  if (password.length < 10) { console.log("Set NEW_PASSWORD (10+ characters) in the environment."); return; }
  const user = await prisma.user.findUnique({ where: { companyId_email: { companyId: company.id, email } } });
  if (!user) { console.log(`No user ${email} in ${company.name}. Run without an email to list them.`); return; }

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 11) } });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  console.log(`Password updated for ${email}. Sign in at https://${subdomain}.<your domain>.`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
