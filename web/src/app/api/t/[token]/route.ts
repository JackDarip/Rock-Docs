import { headers } from "next/headers";
import { prisma, tenantDb } from "@/lib/db";
import { companyForHost } from "@/lib/tenant";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

// Open-tracking pixel in RFQ emails. Only counts when the link is used on the
// subdomain of the company that sent it. Opens are approximate: some mail apps
// preload images and others block them.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();
  const company = await companyForHost(h.get("x-forwarded-host") ?? h.get("host"));
  const rec = company && token.length >= 20 ? await prisma.rfqRecipient.findUnique({ where: { token } }) : null;
  if (company && rec && rec.companyId === company.id) {
    const db = tenantDb(company.id);
    const first = !rec.openedAt;
    await db.rfqRecipient.update({
      where: { id: rec.id },
      data: { openCount: { increment: 1 }, ...(first ? { openedAt: new Date() } : {}), ...(rec.status === "SENT" ? { status: "OPENED" } : {}) },
    });
    if (first) await db.rfqEvent.create({ data: { rfqId: rec.rfqId, recipientId: rec.id, type: "OPENED", detail: `${rec.name} opened the email` } as any });
  }
  return new Response(new Uint8Array(GIF), { headers: { "content-type": "image/gif", "cache-control": "no-store, max-age=0" } });
}
