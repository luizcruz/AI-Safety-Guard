"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const mammoth = require("mammoth");
const JSZip = require("jszip");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { extractText, scanFile, fileType, Registry, AttachmentError } = require("../src/attachments.js");
const { analyze } = require("../src/detector.js");

function file(name, bytes, type = "") {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return { name, type, size: data.byteLength, lastModified: 1, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
}

function createPdf(text) {
  const escaped = text.replace(/[()\\]/g, "\\$&");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${escaped.length + 36} >>\nstream\nBT /F1 12 Tf 72 700 Td (${escaped}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

async function createDocx(text) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.folder("_rels").file(".rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.folder("word").file("document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array" });
}

test("reconhece somente anexos PDF e Word", () => {
  assert.equal(fileType({ name: "report.PDF" }), "pdf");
  assert.equal(fileType({ name: "report.docx" }), "docx");
  assert.equal(fileType({ name: "legacy.doc" }), "doc");
  assert.equal(fileType({ name: "image.png" }), null);
});

test("extrai texto de PDF real com PDF.js", async () => {
  const attachment = file("dados.pdf", createPdf("CPF: 123.456.789-09"), "application/pdf");
  const extracted = await extractText(attachment, {}, { pdfLoader: () => import("pdfjs-dist/legacy/build/pdf.mjs") });
  assert.equal(extracted.type, "pdf");
  assert.match(extracted.text, /123\.456\.789-09/);
});

test("extrai texto de DOCX real com Mammoth", async () => {
  const attachment = file("dados.docx", await createDocx("api_key: segredo-interno"));
  const extracted = await extractText(attachment, {}, {
    mammothLoader: async () => ({ extractRawText: ({ arrayBuffer }) => mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) }) })
  });
  assert.equal(extracted.type, "docx");
  assert.match(extracted.text, /segredo-interno/);
});

test("bundle Mammoth inicializa como módulo da extensão", async () => {
  delete globalThis.mammoth;
  const moduleUrl = `${pathToFileURL(path.join(__dirname, "..", "vendor", "mammoth.browser.min.mjs")).href}?test=1`;
  await import(moduleUrl);
  assert.equal(typeof globalThis.mammoth.extractRawText, "function");
  delete globalThis.mammoth;
});

test("bloqueia DOCX com expansão acima do limite seguro", async () => {
  const attachment = file("bomb.docx", await createDocx("conteúdo normal"));
  await assert.rejects(() => extractText(attachment, { maxDocxExpandedBytes: 10 }, {
    mammothLoader: async () => assert.fail("Mammoth não deve processar contêiner acima do limite")
  }), /excede o limite seguro/);
});

test("extrai cadeias de DOC legado e detecta conteúdo sensível", async () => {
  const signature = Uint8Array.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
  const text = new Uint8Array(Buffer.from("CPF: 123.456.789-09", "utf16le"));
  const bytes = new Uint8Array(signature.length + text.length);
  bytes.set(signature); bytes.set(text, signature.length);
  const result = await scanFile(file("legacy.doc", bytes), analyze, {});
  assert.equal(result.type, "doc");
  assert.equal(result.result.blocked, true);
});

test("rejeita arquivo grande, DOC inválido e documento sem texto", async () => {
  await assert.rejects(() => extractText({ ...file("large.pdf", new Uint8Array()), size: 20 * 1024 * 1024 }), (error) => error instanceof AttachmentError && error.code === "too-large");
  await assert.rejects(() => extractText(file("invalid.doc", new Uint8Array(20))), /formato inválido/);
  const emptyDocx = await createDocx("");
  await assert.rejects(() => extractText(file("empty.docx", emptyDocx), {}, {
    mammothLoader: async () => ({ extractRawText: ({ arrayBuffer }) => mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) }) })
  }), /sem texto extraível/);
});

test("registro acompanha análises pendentes, bloqueadas e removidas", async () => {
  let finish;
  const registry = new Registry(() => new Promise((resolve) => { finish = resolve; }));
  const attachment = file("dados.pdf", createPdf("x"));
  const ids = registry.add([attachment]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(registry.state().pending.length, 1);
  finish({ result: { blocked: true, findings: [], categories: [] } });
  const completed = await registry.wait(ids);
  assert.equal(completed[0].status, "blocked");
  assert.equal(registry.state().blocked.length, 1);
  registry.remove(ids);
  assert.equal(registry.state().blocked.length, 0);
});

test("registro aguarda falhas de leitura antes de liberar o fluxo", async () => {
  const registry = new Registry(async () => { throw new Error("falha local"); });
  const ids = registry.add([file("dados.pdf", createPdf("x"))]);
  const completed = await registry.wait(ids);
  assert.equal(completed[0].status, "error");
  assert.match(completed[0].error, /falha local/);
});

test("usa nome do arquivo quando não existe leitor para o formato", async () => {
  const result = await scanFile(file("credentials.csv", new TextEncoder().encode("ignored")), analyze, {}, undefined, undefined, require("../src/detector.js").analyzeFileName);
  assert.equal(result.type, "filename");
  assert.equal(result.result.blocked, true);
  const benign = await scanFile(file("photo.jpg", new Uint8Array()), analyze, {}, undefined, undefined, require("../src/detector.js").analyzeFileName);
  assert.equal(benign.result.blocked, false);
});

test("aplica regra de nome mesmo quando a extração é bem-sucedida", async () => {
  const attachment = file("cnh.pdf", createPdf("documento sem padrões internos"));
  const result = await scanFile(attachment, analyze, {}, {}, { pdfLoader: () => import("pdfjs-dist/legacy/build/pdf.mjs") }, require("../src/detector.js").analyzeFileName);
  assert.equal(result.result.blocked, true);
  assert.ok(result.result.categories.includes("sensitiveFileNames"));
});
