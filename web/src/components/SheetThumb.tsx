"use client";
import { useEffect, useRef, useState } from "react";

// Sheet thumbnails for the index. Pages render lazily as rows scroll into view,
// one at a time, using range requests, so a 500-sheet set never loads whole.
const docs = new Map<string, Promise<any>>();
const done = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();

function openDoc(id: string) {
  if (!docs.has(id)) {
    docs.set(id, (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs.getDocument({ url: `/api/files/${id}?inline=1`, rangeChunkSize: 1 << 19, disableAutoFetch: true }).promise;
    })());
  }
  return docs.get(id)!;
}

function render(docId: string, pageIndex: number, width: number) {
  const key = `${docId}:${pageIndex}`;
  if (done.has(key)) return Promise.resolve(done.get(key)!);
  const job = queue.then(async () => {
    const d = await openDoc(docId);
    const page = await d.getPage(pageIndex + 1);
    const vp1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: (width * 2) / vp1.width });
    const c = document.createElement("canvas");
    c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext("2d")!, viewport: vp }).promise;
    page.cleanup();
    const url = c.toDataURL("image/jpeg", 0.7);
    done.set(key, url);
    return url;
  });
  queue = job.catch(() => undefined);
  return job;
}

export function SheetThumb({ docId, pageIndex, width = 64, href }: { docId: string; pageIndex: number; width?: number; href: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [src, setSrc] = useState<string | null>(done.get(`${docId}:${pageIndex}`) ?? null);
  useEffect(() => {
    if (src || !ref.current) return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        io.disconnect();
        render(docId, pageIndex, width).then(setSrc).catch(() => setSrc(""));
      }
    }, { rootMargin: "200px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [docId, pageIndex, width, src]);
  return (
    <a ref={ref} href={href} className="block overflow-hidden rounded border border-line bg-white" style={{ width, height: Math.round(width * 0.66) }} aria-label={`Open page ${pageIndex + 1}`}>
      {src ? <img src={src} alt="" className="h-full w-full object-contain" /> : <span className="flex h-full items-center justify-center text-[10px] text-faint">{src === "" ? "—" : "…"}</span>}
    </a>
  );
}
