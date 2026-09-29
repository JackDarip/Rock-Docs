// LandXML TIN surfaces → cut/fill by grid comparison. Earthwork quantities are
// never guessed from PDF contours; they come from the owner, from surfaces
// like these, or from a manual entry with a source note.

export type Tin = { name: string; points: Float64Array; faces: Uint32Array; units: "feet" | "meters" };

/** Parse every TIN surface in a LandXML document. Points are "northing easting elevation". */
export function parseLandXml(xml: string): Tin[] {
  const metric = /<Metric\b[^>]*linearUnit="(meter|millimeter|centimeter|kilometer)"/i.test(xml);
  const out: Tin[] = [];
  const surfRe = /<Surface\b([^>]*)>([\s\S]*?)<\/Surface>/g;
  let m: RegExpExecArray | null;
  while ((m = surfRe.exec(xml))) {
    const name = /\bname="([^"]*)"/.exec(m[1])?.[1] ?? `Surface ${out.length + 1}`;
    const body = m[2];
    const ids = new Map<string, number>();
    const pts: number[] = [];
    const pRe = /<P\b([^>]*)>([^<]*)<\/P>/g;
    let p: RegExpExecArray | null;
    while ((p = pRe.exec(body))) {
      const id = /\bid="([^"]+)"/.exec(p[1])?.[1];
      const v = p[2].trim().split(/\s+/).map(Number);
      if (!id || v.length < 3 || v.some((x) => !Number.isFinite(x))) continue;
      ids.set(id, pts.length / 3);
      pts.push(v[1], v[0], v[2]); // store x=easting, y=northing, z
    }
    const faces: number[] = [];
    const fRe = /<F\b([^>]*)>([^<]*)<\/F>/g;
    let f: RegExpExecArray | null;
    while ((f = fRe.exec(body))) {
      if (/\bi="1"/.test(f[1])) continue; // invisible (outside the boundary)
      const v = f[2].trim().split(/\s+/);
      if (v.length < 3) continue;
      const a = ids.get(v[0]), b = ids.get(v[1]), c = ids.get(v[2]);
      if (a == null || b == null || c == null) continue;
      faces.push(a, b, c);
    }
    if (pts.length >= 9 && faces.length >= 3) out.push({ name, points: Float64Array.from(pts), faces: Uint32Array.from(faces), units: metric ? "meters" : "feet" });
  }
  return out;
}

export function bbox(t: Tin): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < t.points.length; i += 3) {
    const x = t.points[i], y = t.points[i + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/** Compact binary form for storage: [u32 nPts][u32 nFaces][f64 pts…][u32 faces…]. */
export function packTin(t: Tin) {
  const head = Buffer.alloc(8);
  head.writeUInt32LE(t.points.length / 3, 0);
  head.writeUInt32LE(t.faces.length / 3, 4);
  return Buffer.concat([head, Buffer.from(t.points.buffer, t.points.byteOffset, t.points.byteLength), Buffer.from(t.faces.buffer, t.faces.byteOffset, t.faces.byteLength)]);
}

export function unpackTin(buf: Buffer, name: string, units: "feet" | "meters"): Tin {
  const np = buf.readUInt32LE(0), nf = buf.readUInt32LE(4);
  const pts = new Float64Array(np * 3), faces = new Uint32Array(nf * 3);
  Buffer.from(pts.buffer).set(buf.subarray(8, 8 + np * 24));
  Buffer.from(faces.buffer).set(buf.subarray(8 + np * 24, 8 + np * 24 + nf * 12));
  return { name, points: pts, faces, units };
}

/** Elevation raster: z at each cell centre, NaN where the surface doesn't cover it. */
function rasterize(t: Tin, x0: number, y0: number, g: number, w: number, h: number) {
  const z = new Float64Array(w * h).fill(NaN);
  const P = t.points, F = t.faces;
  for (let k = 0; k < F.length; k += 3) {
    const a = F[k] * 3, b = F[k + 1] * 3, c = F[k + 2] * 3;
    const ax = P[a], ay = P[a + 1], az = P[a + 2], bx = P[b], by = P[b + 1], bz = P[b + 2], cx = P[c], cy = P[c + 1], cz = P[c + 2];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-12) continue;
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - x0) / g - 0.5)), i1 = Math.min(w - 1, Math.floor((Math.max(ax, bx, cx) - x0) / g - 0.5));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - y0) / g - 0.5)), j1 = Math.min(h - 1, Math.floor((Math.max(ay, by, cy) - y0) / g - 0.5));
    for (let j = j0; j <= j1; j++) {
      const py = y0 + (j + 0.5) * g;
      for (let i = i0; i <= i1; i++) {
        const px = x0 + (i + 0.5) * g;
        const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det;
        const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        z[j * w + i] = l1 * az + l2 * bz + l3 * cz;
      }
    }
  }
  return z;
}

export type CutFill = {
  gridFt: number; areaSf: number; cutCy: number; fillCy: number;
  preview: { w: number; h: number; max: number; cells: (number | null)[] };
};

/** Compare two TINs on a square grid over their overlap. Results in cubic yards and square feet. */
export function cutFill(existing: Tin, proposed: Tin, gridSize?: number, maxCells = 4_000_000): CutFill {
  const toFt = existing.units === "meters" ? 3.28084 : 1;
  const [ax0, ay0, ax1, ay1] = bbox(existing), [bx0, by0, bx1, by1] = bbox(proposed);
  const x0 = Math.max(ax0, bx0), y0 = Math.max(ay0, by0), x1 = Math.min(ax1, bx1), y1 = Math.min(ay1, by1);
  if (!(x1 > x0 && y1 > y0)) throw new Error("These two surfaces don't overlap. Check that both use the same coordinate system.");
  const area = (x1 - x0) * (y1 - y0);
  let g = gridSize ? gridSize / toFt : Math.max(Math.sqrt(area / 1_000_000), 1 / toFt);
  if (area / (g * g) > maxCells) g = Math.sqrt(area / maxCells);
  const w = Math.max(1, Math.ceil((x1 - x0) / g)), h = Math.max(1, Math.ceil((y1 - y0) / g));
  const ze = rasterize(existing, x0, y0, g, w, h), zp = rasterize(proposed, x0, y0, g, w, h);
  let cut = 0, fill = 0, cells = 0;
  const pw = Math.min(160, w), ph = Math.min(160, h);
  const sum = new Float64Array(pw * ph), cnt = new Uint32Array(pw * ph);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const e = ze[j * w + i], p = zp[j * w + i];
    if (Number.isNaN(e) || Number.isNaN(p)) continue;
    const d = p - e;
    cells++;
    if (d < 0) cut -= d; else fill += d;
    const k = Math.min(ph - 1, Math.floor((j / h) * ph)) * pw + Math.min(pw - 1, Math.floor((i / w) * pw));
    sum[k] += d; cnt[k]++;
  }
  const cellAreaSf = g * g * toFt * toFt;
  const cf = toFt * toFt * toFt;
  const pv: (number | null)[] = [];
  let max = 0;
  // preview rows top = north
  for (let j = ph - 1; j >= 0; j--) for (let i = 0; i < pw; i++) {
    const k = j * pw + i;
    const v = cnt[k] ? (sum[k] / cnt[k]) * toFt : null;
    if (v != null) max = Math.max(max, Math.abs(v));
    pv.push(v == null ? null : Math.round(v * 100) / 100);
  }
  return {
    gridFt: g * toFt, areaSf: cells * cellAreaSf,
    cutCy: (cut * g * g * cf) / 27, fillCy: (fill * g * g * cf) / 27,
    preview: { w: pw, h: ph, max, cells: pv },
  };
}

/**
 * Balance with the company's soil factors. Cut is bank (in place); fill is
 * compacted. Swell: bank → loose (trucks). Shrink: bank → compacted.
 */
export function balance(cutCy: number, fillCy: number, swellPct: number | null, shrinkPct: number | null) {
  const shrink = (shrinkPct ?? 0) / 100, swell = (swellPct ?? 0) / 100;
  const bankForFill = shrink < 1 ? fillCy / (1 - shrink) : fillCy;
  const net = cutCy - bankForFill;
  return {
    bankForFill,
    exportBankCy: net > 0 ? net : 0, exportLooseCy: net > 0 ? net * (1 + swell) : 0,
    importBankCy: net < 0 ? -net : 0, importLooseCy: net < 0 ? -net * (1 + swell) : 0,
  };
}
