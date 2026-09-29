// Copies the pdf.js worker into /public so the browser plan viewer can load it.
import fs from "fs";
import path from "path";
const src = path.resolve("node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
if (fs.existsSync(src)) fs.copyFileSync(src, path.resolve("public/pdf.worker.min.mjs"));
