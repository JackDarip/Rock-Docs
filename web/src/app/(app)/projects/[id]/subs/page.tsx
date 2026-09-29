import { requireCtx } from "@/lib/auth";
import { Card } from "@/components/ui";
import { ScopeEditor, ScopeCard } from "@/components/Scopes";

export default async function SubScopes({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireCtx();
  const [project, scopes, bidItems, cats, subs] = await Promise.all([
    db.project.findUniqueOrThrow({ where: { id } }),
    db.scopePackage.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } }),
    db.bidItem.findMany({ where: { projectId: id }, orderBy: { sortOrder: "asc" } }),
    db.supplierCategory.findMany({ orderBy: { name: "asc" } }),
    db.supplier.findMany({ where: { kind: "SUBCONTRACTOR" }, include: { contacts: true } }),
  ]);
  const trades = cats.filter((c) => c.kind === "SUBCONTRACTOR").map((c) => ({ code: c.code, name: c.name }));
  const bi = bidItems.map((b) => ({ id: b.id, itemNumber: b.itemNumber, description: b.description, quantity: b.quantity, unit: b.unit }));
  const subList = subs.map((s) => ({ id: s.id, name: s.name, categories: s.categories, email: (s.contacts.find((c) => c.isPrimary) ?? s.contacts[0])?.email ?? null }));
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted">Work you&apos;ll sub out (striping, fencing, electrical, traffic control…) goes in a scope package: what&apos;s included, which bid items it covers, and the quantities. Download it as Excel or PDF and send it to your subs.</p>
      {scopes.map((s) => <ScopeCard key={s.id} projectId={id} projectName={project.name} bidItems={bi} trades={trades} subs={subList} scope={{ id: s.id, name: s.name, trade: s.trade, description: s.description, lines: s.lines as any }} />)}
      <Card title="New scope package"><ScopeEditor projectId={id} bidItems={bi} trades={trades} /></Card>
    </div>
  );
}
