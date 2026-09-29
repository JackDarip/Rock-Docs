import { z } from "zod";
import { apiCtx, unauthorized } from "@/lib/apictx";

// Chunked, resumable uploads: POST here to start, PUT chunks to /api/uploads/:id
// with an x-offset header, GET /api/uploads/:id to learn where to resume, then
// POST /api/uploads/:id/complete.
const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB

export async function POST(req: Request) {
  const ctx = await apiCtx();
  if (!ctx) return unauthorized();
  const body = z.object({ projectId: z.string(), filename: z.string().min(1), size: z.number().int().positive().max(MAX_BYTES), mime: z.string(), kind: z.string().optional() }).safeParse(await req.json());
  if (!body.success) return Response.json({ error: "Invalid upload" }, { status: 400 });
  const project = await ctx.db.project.findUnique({ where: { id: body.data.projectId } });
  if (!project) return Response.json({ error: "Bid not found" }, { status: 404 });
  const s = await ctx.db.uploadSession.create({
    data: { projectId: project.id, filename: body.data.filename, size: body.data.size, mime: body.data.mime || "application/octet-stream", kind: body.data.kind ?? "OTHER", userId: ctx.user.id } as any,
  });
  return Response.json({ id: s.id, receivedBytes: 0 });
}
