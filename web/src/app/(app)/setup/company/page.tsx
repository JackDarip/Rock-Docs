import { requireCtx } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { CompanyForm } from "@/components/CompanyForm";
import { StepNav } from "@/components/StepNav";

export default async function CompanyStep() {
  const { company, isAdmin } = await requireCtx();
  const c = JSON.parse(JSON.stringify(company));
  return (
    <>
      <PageHeader eyebrow="Step 1 of 9" title="Company basics" subtitle="Everything saves as you go. Change it anytime; new bids pick up the new defaults." />
      <CompanyForm company={c} readOnly={!isAdmin} />
      <StepNav current="company" />
    </>
  );
}
