import { apiCtx, notFound, unauthorized } from "@/lib/apictx";
import { newKey, scanFile, storage } from "@/lib/storage";
import { enqueue } from "@/lib/jobs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiCtx();
  if (!ctx) return unauthorized();
  const { id } = await params;
  const s = await ctx.db.uploadSession.findUnique({ where: { id } });
  if (!s) return notFound();
  const tmp = `${ctx.company.id}/uploads-tmp/${id}.part`;
  const size = await storage.size(ctx.company.id, tmp);
  if (size !== s.size) return Response.json({ error: `Upload incomplete (${size} of ${s.size} bytes)` }, { status: 409 });
  const key = newKey(ctx.company.id, `projects/${s.projectId}/docs`, s.filename);
  await storage.move(ctx.company.id, tmp, key);
  let scan;
  try { scan = await scanFile(ctx.company.id, key); }
  catch (e) {
    await storage.move(ctx.company.id, key, tmp); // keep the upload so "complete" can be retried
    return Response.json({ error: e instanceof Error ? e.message : "Virus scanner unavailable" }, { status: 503 });
  }
  if (scan === "INFECTED") {
    await storage.remove(ctx.company.id, key);
    return Response.json({ error: "This file failed the virus scan and was deleted." }, { status: 422 });
  }
  const doc = await ctx.db.document.create({
    data: { projectId: s.projectId, filename: s.filename, storageKey: key, size: s.size, mime: s.mime, kind: s.kind, kindConfirmed: s.kind !== "OTHER", scanStatus: scan, uploadedById: ctx.user.id, status: "UPLOADED", statusDetail: "Queued for processing" } as any,
  });
  await ctx.db.uploadSession.delete({ where: { id } });
  await enqueue(ctx.company.id, "PROCESS_DOCUMENT", { documentId: doc.id });
  return Response.json({ documentId: doc.id });
}
