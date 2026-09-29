import { requireCtx } from "@/lib/auth";
import { loadSetup } from "@/lib/estimate";
import { PageHeader, Term } from "@/components/ui";
import { ProductionEditor } from "@/components/ProductionEditor";
import { StepNav } from "@/components/StepNav";

export default async function ProductionStep() {
  const { db, isAdmin } = await requireCtx();
  const s = await loadSetup(db);
  return (
    <>
      <PageHeader eyebrow="Step 6 of 9" title="Production rates"
        subtitle={<>Tell TrueGrade what your crews really get done in a day, and who and what is on the crew. That&apos;s your <Term k="production">production rate</Term>; it turns quantities into hours. Any bid can override a rate for that job only.</>} />
      <ProductionEditor rates={s.productionRates} laborRoles={s.laborRoles} equipment={s.equipment} readOnly={!isAdmin} />
      <StepNav current="production" />
    </>
  );
}
