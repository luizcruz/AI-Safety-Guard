import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  ["node_modules/mammoth/mammoth.browser.min.js", "vendor/mammoth.browser.min.mjs"],
  ["node_modules/mammoth/LICENSE", "vendor/LICENSE.mammoth"],
  ["node_modules/pdfjs-dist/build/pdf.mjs", "vendor/pdf.mjs"],
  ["node_modules/pdfjs-dist/build/pdf.worker.mjs", "vendor/pdf.worker.mjs"],
  ["node_modules/pdfjs-dist/LICENSE", "vendor/LICENSE.pdfjs"]
];

await mkdir(resolve(root, "vendor"), { recursive: true });
for (const [source, destination] of files) await copyFile(resolve(root, source), resolve(root, destination));

for (const license of ["vendor/LICENSE.mammoth", "vendor/LICENSE.pdfjs"]) {
  const licensePath = resolve(root, license);
  const source = await readFile(licensePath, "utf8");
  await writeFile(licensePath, source.replace(/[ \t]+$/gm, ""));
}

const pdfPath = resolve(root, "vendor/pdf.mjs");
const pdfSource = await readFile(pdfPath, "utf8");
const workerFlag = "static #isWorkerDisabled = false;";
if (!pdfSource.includes(workerFlag)) throw new Error("Não foi possível desabilitar o Web Worker do PDF.js");
await writeFile(pdfPath, pdfSource.replace(workerFlag, "static #isWorkerDisabled = true;"));
