import { apiCtx, notFound, unauthorized } from "@/lib/apictx";
import { storage } from "@/lib/storage";

const tmpKey = (companyId: string, id: string) => `${companyId}/uploads-tmp/${id}.part`;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiCtx();
  if (!ctx) return unauthorized();
  const { id } = await params;
  const s = await ctx.db.uploadSession.findUnique({ where: { id } });
  if (!s) return notFound();
  const received = await storage.size(ctx.company.id, tmpKey(ctx.company.id, id));
  return Response.json({ id, receivedBytes: received, size: s.size });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiCtx();
  if (!ctx) return unauthorized();
  const { id } = await params;
  const s = await ctx.db.uploadSession.findUnique({ where: { id } });
  if (!s) return notFound();
  const key = tmpKey(ctx.company.id, id);
  const offset = Number(req.headers.get("x-offset") ?? "0");
  const have = await storage.size(ctx.company.id, key);
  if (offset !== have) return Response.json({ error: "Offset mismatch", receivedBytes: have }, { status: 409 });
  const chunk = Buffer.from(await req.arrayBuffer());
  if (have + chunk.length > s.size) return Response.json({ error: "Too much data" }, { status: 400 });
  await storage.append(ctx.company.id, key, chunk);
  const receivedBytes = have + chunk.length;
  await ctx.db.uploadSession.update({ where: { id }, data: { receivedBytes } });
  return Response.json({ receivedBytes });
}
