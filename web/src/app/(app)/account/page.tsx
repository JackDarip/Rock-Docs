import { requireCtx } from "@/lib/auth";
import { PageHeader, Card } from "@/components/ui";
import { PasswordForm } from "@/components/PasswordForm";

export default async function AccountPage() {
  const { user } = await requireCtx();
  return (
    <>
      <PageHeader title="My account" subtitle={`Signed in as ${user.email}`} />
      <div className="max-w-md">
        <Card title="Change password"><PasswordForm /></Card>
      </div>
    </>
  );
}
