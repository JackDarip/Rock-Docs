#!/usr/bin/env node
/**
 * Builds the client overview PDF from template.html.
 *
 *   NODE_PATH=$(npm root -g) node client-overview/build.cjs
 *
 * Requires Playwright with a Chromium install. Set CHROMIUM_PATH to use a specific binary.
 * All names and labels live in CONFIG below. Never hardcode them in template.html.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ---------------------------------------------------------------- config
const CONFIG = {
  PRODUCT_NAME: 'Rock Docs',
  TAGLINE: 'Estimates calibrated to your real costs.',
  DOC_TITLE: 'Capabilities & Client Inputs',
  CLIENT_NAME: 'Interstate Rock',
  WORKSPACE_URL: 'interstaterock.theanswerai.com',
  PREPARED_BY: 'The Answer AI',
  CONTACT_LINE: 'theanswerai.com',
  DATE: 'September 2026',
};
const OUTPUT_PDF = path.join(__dirname, '..', `${CONFIG.PRODUCT_NAME.replace(/\s+/g, '-')}-Client-Overview.pdf`);

// ---------------------------------------------------------------- topographic contour art (cover)
function makeContourSVG(w, h, seed) {
  const hash = (ix, iy) => {
    let n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967295;
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = smooth(x - ix), fy = smooth(y - iy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
  const fbm = (x, y) => noise(x, y) * 0.55 + noise(x * 2.1, y * 2.1) * 0.28 + noise(x * 4.3, y * 4.3) * 0.12;

  const cols = 120, rows = Math.round(cols * (h / w));
  const f = [];
  for (let j = 0; j <= rows; j++) {
    f[j] = [];
    for (let i = 0; i <= cols; i++) f[j][i] = fbm(i * 0.055 + 3, j * 0.055 + 7);
  }
  const cx = w / cols, cy = h / rows;
  const lerp = (l, a, b) => (b === a ? 0.5 : (l - a) / (b - a));

  let min = Infinity, max = -Infinity;
  f.forEach((r) => r.forEach((v) => { min = Math.min(min, v); max = Math.max(max, v); }));

  const minor = [], major = [];
  const levels = 26;
  for (let k = 1; k < levels; k++) {
    const lvl = min + ((max - min) * k) / levels;
    const target = k % 5 === 0 ? major : minor;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = f[j][i], b = f[j][i + 1], c = f[j + 1][i + 1], d = f[j + 1][i];
        const idx = (a > lvl ? 8 : 0) | (b > lvl ? 4 : 0) | (c > lvl ? 2 : 0) | (d > lvl ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const x0 = i * cx, y0 = j * cy;
        const T = [x0 + lerp(lvl, a, b) * cx, y0];
        const R = [x0 + cx, y0 + lerp(lvl, b, c) * cy];
        const B = [x0 + lerp(lvl, d, c) * cx, y0 + cy];
        const L = [x0, y0 + lerp(lvl, a, d) * cy];
        const seg = {
          1: [[L, B]], 14: [[L, B]], 2: [[B, R]], 13: [[B, R]], 3: [[L, R]], 12: [[L, R]],
          4: [[T, R]], 11: [[T, R]], 6: [[T, B]], 9: [[T, B]], 7: [[T, L]], 8: [[T, L]],
          5: [[T, L], [B, R]], 10: [[T, R], [L, B]],
        }[idx];
        seg.forEach(([p, q]) => target.push(`M${p[0].toFixed(1)} ${p[1].toFixed(1)}L${q[0].toFixed(1)} ${q[1].toFixed(1)}`));
      }
    }
  }
  return `<svg class="contours" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <path d="${minor.join('')}" fill="none" stroke="#3E8E94" stroke-opacity=".38" stroke-width=".9" stroke-linecap="round"/>
    <path d="${major.join('')}" fill="none" stroke="#6FC0C6" stroke-opacity=".62" stroke-width="1.7" stroke-linecap="round"/>
  </svg>`;
}

// ---------------------------------------------------------------- build
(async () => {
  let html = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
  const values = {
    ...CONFIG,
    FONT_DIR: 'file://' + path.join(__dirname, 'fonts'),
    CONTOUR_SVG: makeContourSVG(816, 1056, 11),
  };
  // {{KEY}} is HTML-escaped; {{KEY|css}} is escaped for use inside a CSS string (page footers)
  html = html.replace(/\{\{([A-Z_]+)(\|css)?\}\}/g, (m, key, css) => {
    if (!(key in values)) throw new Error(`Unknown placeholder ${m}`);
    const v = String(values[key]);
    if (key === 'CONTOUR_SVG' || key === 'FONT_DIR') return v;
    if (css) return v.replace(/[\\"]/g, '\\$&');
    return v.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  });

  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, 'overview.html');
  fs.writeFileSync(htmlPath, html);

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  await page.goto('file://' + htmlPath, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: OUTPUT_PDF, preferCSSPageSize: true, printBackground: true });
  await browser.close();
  console.log('Wrote', OUTPUT_PDF);
})().catch((e) => { console.error(e); process.exit(1); });
