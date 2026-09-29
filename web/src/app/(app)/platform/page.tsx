import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCtx, isPlatformAdmin } from "@/lib/auth";
import { createTenant } from "@/lib/tenants";
import { PageHeader, Card, fmtDate } from "@/components/ui";

async function create(formData: FormData) {
  "use server";
  const { user } = await requireCtx();
  if (!isPlatformAdmin(user)) redirect("/");
  const d = z.object({
    name: z.string().min(1), subdomain: z.string().regex(/^[a-z0-9-]{2,40}$/), rfqPrefix: z.string().min(1).max(5),
    adminName: z.string().min(1), adminEmail: z.string().email(), adminPassword: z.string().min(10),
  }).parse(Object.fromEntries(formData));
  await createTenant({ name: d.name, subdomain: d.subdomain, rfqPrefix: d.rfqPrefix, admin: { name: d.adminName, email: d.adminEmail, password: d.adminPassword } });
  revalidatePath("/platform");
}

export default async function Platform() {
  const { user } = await requireCtx();
  if (!isPlatformAdmin(user)) redirect("/");
  const companies = await prisma.company.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { users: true } } } });
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const usage = await prisma.aiUsage.groupBy({ by: ["companyId"], where: { createdAt: { gte: start } }, _sum: { costUsd: true } });
  const root = process.env.ROOT_DOMAIN ?? "theanswerai.com";
  return (
    <>
      <PageHeader title="Tenants" subtitle="Internal tool: each contractor gets its own subdomain and fully isolated data. No schema changes needed to add one." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <table className="tbl">
            <thead><tr><th>Company</th><th>Address</th><th>RFQ prefix</th><th>Users</th><th>AI this month</th><th>Created</th></tr></thead>
            <tbody>{companies.map((c) => (
              <tr key={c.id}><td className="font-semibold">{c.name}</td><td className="font-mono text-xs">{c.subdomain}.{root}</td><td>{c.rfqPrefix}</td><td>{c._count.users}</td>
                <td>${(usage.find((u) => u.companyId === c.id)?._sum.costUsd ?? 0).toFixed(2)} / ${c.aiMonthlyLimitUsd}</td><td>{fmtDate(c.createdAt)}</td></tr>
            ))}</tbody>
          </table>
        </Card>
        <Card title="New tenant">
          <form action={create} className="space-y-3">
            <div><label className="label">Company name</label><input name="name" className="input" required /></div>
            <div><label className="label">Subdomain</label><div className="flex items-center gap-1"><input name="subdomain" className="input" pattern="[a-z0-9-]{2,40}" required /><span className="text-xs text-muted">.{root}</span></div></div>
            <div><label className="label">RFQ prefix</label><input name="rfqPrefix" className="input" maxLength={5} required /></div>
            <div><label className="label">First admin name</label><input name="adminName" className="input" required /></div>
            <div><label className="label">First admin email</label><input name="adminEmail" type="email" className="input" required /></div>
            <div><label className="label">Temporary password</label><input name="adminPassword" className="input" minLength={10} required /></div>
            <button className="btn btn-primary">Create tenant</button>
          </form>
        </Card>
      </div>
    </>
  );
}
