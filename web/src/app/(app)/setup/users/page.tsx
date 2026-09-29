import { requireCtx } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card } from "@/components/ui";
import { UserForm } from "@/components/UserForm";

export default async function UsersPage() {
  const { company, isAdmin } = await requireCtx();
  const users = await prisma.user.findMany({ where: { companyId: company.id }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Team" subtitle="Admins manage setup, rates, approvals, the supplier directory and email settings. Estimators build estimates and send or export RFQs." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th></tr></thead>
            <tbody>{users.map((u) => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.phone ?? "—"}</td><td>{u.role === "ADMIN" ? "Admin" : "Estimator"}</td></tr>)}</tbody>
          </table>
        </Card>
        {isAdmin && <Card title="Add a teammate"><UserForm /></Card>}
      </div>
    </>
  );
}
