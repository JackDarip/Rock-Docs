import { requireCtx } from "@/lib/auth";
import { loadSetup } from "@/lib/estimate";
import { PageHeader, Term } from "@/components/ui";
import { AssemblyEditor } from "@/components/AssemblyEditor";
import { StepNav } from "@/components/StepNav";

export default async function AssembliesStep() {
  const { db, isAdmin } = await requireCtx();
  const s = await loadSetup(db);
  return (
    <>
      <PageHeader eyebrow="Step 8 of 9" title="Assemblies"
        subtitle={<><Term k="assembly">Assemblies</Term> are your reusable work packages. Each bid item gets mapped to one or more assemblies, which is how quantities become labor, equipment, and a material list for RFQs. Be explicit about material per unit.</>} />
      <AssemblyEditor assemblies={s.assemblies} setup={{ laborRoles: s.laborRoles, equipment: s.equipment, materials: s.materials, productionRates: s.productionRates }} readOnly={!isAdmin} />
      <StepNav current="assemblies" />
    </>
  );
}
