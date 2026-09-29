"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const CHUNK = 8 * 1024 * 1024;
const KINDS: [string, string][] = [
  ["OTHER", "Auto-detect"], ["PLANS", "Plan set"], ["BID_SCHEDULE", "Bid schedule / bid form"], ["SPECS", "Specifications"],
  ["GEOTECH", "Geotechnical report"], ["ADDENDUM", "Addendum"], ["CAD", "CAD / LandXML / points"],
];

type Item = { name: string; size: number; sent: number; status: string };

/** Chunked, resumable uploader. Interrupted uploads resume from the last chunk the server has. */
export function Uploader({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [kind, setKind] = useState("OTHER");
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const update = (name: string, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.name === name ? { ...x, ...patch } : x)));

  async function uploadOne(file: File) {
    const resumeKey = `tg-upload:${projectId}:${file.name}:${file.size}:${file.lastModified}`;
    let id: string | null = null;
    let offset = 0;
    try { id = localStorage.getItem(resumeKey); } catch { /* storage unavailable */ }
    if (id) {
      const r = await fetch(`/api/uploads/${id}`);
      if (r.ok) offset = (await r.json()).receivedBytes; else id = null;
    }
    if (!id) {
      const r = await fetch("/api/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, filename: file.name, size: file.size, mime: file.type, kind }) });
      if (!r.ok) throw new Error((await r.json()).error ?? "Upload failed");
      id = (await r.json()).id as string;
      try { localStorage.setItem(resumeKey, id); } catch { /* ignore */ }
    }
    while (offset < file.size) {
      const chunk = file.slice(offset, offset + CHUNK);
      let tries = 0;
      for (;;) {
        const r = await fetch(`/api/uploads/${id}`, { method: "PUT", headers: { "x-offset": String(offset) }, body: chunk }).catch(() => null);
        if (r?.ok) { offset = (await r.json()).receivedBytes; break; }
        if (r?.status === 409) { offset = (await r.json()).receivedBytes; break; }
        if (++tries > 4) throw new Error("Connection lost. Drop the file again to resume where it stopped.");
        await new Promise((res) => setTimeout(res, 1000 * 2 ** tries));
      }
      update(file.name, { sent: offset, status: `Uploading ${Math.round((offset / file.size) * 100)}%` });
    }
    const r = await fetch(`/api/uploads/${id}/complete`, { method: "POST" });
    if (!r.ok) throw new Error((await r.json()).error ?? "Upload failed");
    try { localStorage.removeItem(resumeKey); } catch { /* ignore */ }
    update(file.name, { sent: file.size, status: "Uploaded. Processing in the background…" });
  }

  async function handle(files: FileList | File[]) {
    const list = Array.from(files);
    setItems((xs) => [...xs, ...list.map((f) => ({ name: f.name, size: f.size, sent: 0, status: "Waiting" }))]);
    for (const f of list) {
      try { await uploadOne(f); } catch (e: any) { update(f.name, { status: `⚠ ${e.message}` }); }
    }
    router.refresh();
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${drag ? "border-brand bg-brand-50" : "border-mist bg-white"}`}>
        <div className="font-display text-2xl font-bold">Drop the bid package here</div>
        <p className="mt-1 text-sm text-muted">Plan sets (up to 1 GB), bid schedule (PDF or Excel), specs, geotech, addenda, LandXML/DXF/CSV. Big files upload in pieces and resume if the connection drops. You can keep working while they process.</p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <select className="input w-56" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <button className="btn btn-primary" onClick={() => input.current?.click()}>Choose files</button>
          <input ref={input} type="file" multiple hidden onChange={(e) => e.target.files && handle(e.target.files)} />
        </div>
      </div>
      {items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {items.map((it) => (
            <li key={it.name} className="rounded-lg border border-line bg-white p-2 text-sm">
              <div className="flex justify-between"><span className="font-semibold">{it.name}</span><span className={it.status.startsWith("⚠") ? "text-warn" : "text-muted"}>{it.status}</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-mist"><div className="h-full bg-brand transition-all" style={{ width: `${(it.sent / it.size) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
