import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { PageHeader, EmptyState, fmtDateTime } from "@/components/ui";
import { MarkAllRead } from "@/components/MarkAllRead";

export default async function Notifications() {
  const { db, user } = await requireCtx();
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 200 });
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader title="Notifications" subtitle="Quotes that came in, suppliers who declined, emails that couldn't be sent, and reminders about quotes you're still waiting on."
        actions={unread > 0 ? <MarkAllRead /> : undefined} />
      {items.length === 0 ? (
        <EmptyState title="Nothing yet" body="When a supplier responds or declines, a quote you sent yourself is due soon, or an email can't be delivered, it shows up here." />
      ) : (
        <ul className="card divide-y divide-line p-0">
          {items.map((n) => (
            <li key={n.id} className={`flex items-start gap-3 px-5 py-3 ${n.readAt ? "" : "bg-brand-50/60"}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand"}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{n.href ? <Link href={n.href} className="hover:underline">{n.title}</Link> : n.title}</div>
                {n.body && <div className="text-sm text-muted">{n.body}</div>}
              </div>
              <time className="shrink-0 text-xs text-faint">{fmtDateTime(n.createdAt)}</time>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
