(function exposeAttachmentScanner(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AISafetyAttachmentScanner = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAttachmentScanner(root) {
  "use strict";

  const MAX_FILE_BYTES = 15 * 1024 * 1024;
  const MAX_TEXT_CHARS = 2_000_000;
  const MAX_PDF_PAGES = 200;
  const MAX_DOCX_EXPANDED_BYTES = 50 * 1024 * 1024;
  const EXTRACTION_TIMEOUT_MS = 20_000;
  const RECORD_TTL_MS = 15 * 60 * 1000;

  class AttachmentError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "AttachmentError";
      this.code = code;
    }
  }

  function fileType(file) {
    const name = String(file.name || "").toLowerCase();
    const mime = String(file.type || "").toLowerCase();
    if (name.endsWith(".pdf") || mime === "application/pdf") return "pdf";
    if (name.endsWith(".docx") || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
    if (name.endsWith(".doc") || mime === "application/msword") return "doc";
    return null;
  }

  function fingerprint(file) {
    return `${file.name || "document"}:${file.size || 0}:${file.lastModified || 0}`;
  }

  function withTimeout(promise, milliseconds, onTimeout) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        if (onTimeout) onTimeout();
        reject(new AttachmentError("timeout", "A análise do documento excedeu o tempo limite"));
      }, milliseconds);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function remainingTime(options) {
    return Math.max(1, options.deadline - Date.now());
  }

  async function defaultPdfLoader() {
    if (!root.chrome || !root.chrome.runtime) throw new AttachmentError("pdf-unavailable", "Leitor de PDF indisponível");
    const workerUrl = root.chrome.runtime.getURL("vendor/pdf.worker.mjs");
    await import(workerUrl);
    const pdfjs = await import(root.chrome.runtime.getURL("vendor/pdf.mjs"));
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    return pdfjs;
  }

  async function defaultMammothLoader() {
    if (root.mammoth) return root.mammoth;
    if (!root.chrome || !root.chrome.runtime) throw new AttachmentError("docx-unavailable", "Leitor de DOCX indisponível");
    await import(root.chrome.runtime.getURL("vendor/mammoth.browser.min.mjs"));
    if (!root.mammoth) throw new AttachmentError("docx-unavailable", "Leitor de DOCX não foi inicializado");
    return root.mammoth;
  }

  async function extractPdf(file, options, dependencies) {
    const pdfjs = await (dependencies.pdfLoader || defaultPdfLoader)();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true });
    const document = await withTimeout(loadingTask.promise, remainingTime(options), () => loadingTask.destroy());
    try {
      const pages = Math.min(document.numPages, options.maxPdfPages);
      const chunks = [];
      let length = 0;
      for (let pageNumber = 1; pageNumber <= pages && length < options.maxTextChars; pageNumber += 1) {
        const page = await withTimeout(document.getPage(pageNumber), remainingTime(options));
        const content = await withTimeout(page.getTextContent(), remainingTime(options));
        const pageText = content.items.map((item) => item.str || "").join(" ");
        chunks.push(pageText);
        length += pageText.length;
        page.cleanup();
      }
      return chunks.join("\n").slice(0, options.maxTextChars);
    } finally {
      if (typeof document.cleanup === "function") document.cleanup();
      await loadingTask.destroy();
    }
  }

  async function extractDocx(file, options, dependencies) {
    const arrayBuffer = await file.arrayBuffer();
    validateDocxContainer(new Uint8Array(arrayBuffer), options.maxDocxExpandedBytes);
    const mammoth = await (dependencies.mammothLoader || defaultMammothLoader)();
    const result = await withTimeout(mammoth.extractRawText({ arrayBuffer }), remainingTime(options));
    return String(result.value || "").slice(0, options.maxTextChars);
  }

  function validateDocxContainer(bytes, maxExpandedBytes) {
    if (bytes.byteLength < 22) throw new AttachmentError("invalid-docx", "O arquivo DOCX possui contêiner inválido");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let endOffset = -1;
    const minimum = Math.max(0, bytes.byteLength - 65_557);
    for (let offset = bytes.byteLength - 22; offset >= minimum; offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054B50) { endOffset = offset; break; }
    }
    if (endOffset < 0) throw new AttachmentError("invalid-docx", "O arquivo DOCX possui contêiner inválido");
    const entries = view.getUint16(endOffset + 10, true);
    let offset = view.getUint32(endOffset + 16, true);
    let expandedBytes = 0;
    if (entries > 5000) throw new AttachmentError("docx-complexity", "O arquivo DOCX possui entradas demais");
    for (let index = 0; index < entries; index += 1) {
      if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== 0x02014B50) throw new AttachmentError("invalid-docx", "Diretório do DOCX inválido");
      if (view.getUint16(offset + 8, true) & 1) throw new AttachmentError("encrypted-docx", "DOCX criptografado não pode ser analisado");
      const expanded = view.getUint32(offset + 24, true);
      if (expanded === 0xFFFFFFFF) throw new AttachmentError("zip64-docx", "DOCX ZIP64 não é suportado");
      expandedBytes += expanded;
      if (expandedBytes > maxExpandedBytes) throw new AttachmentError("docx-expanded-too-large", "O conteúdo descompactado do DOCX excede o limite seguro");
      offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    }
  }

  function printableRuns(text) {
    return text.replace(/[^\x20-\x7EÀ-ÿ\r\n\t]/g, "\n")
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length >= 4)
      .join("\n");
  }

  async function extractLegacyDoc(file, options) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const signature = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
    if (!signature.every((value, index) => bytes[index] === value)) throw new AttachmentError("invalid-doc", "O arquivo DOC possui formato inválido");
    const singleByte = printableRuns(new TextDecoder("windows-1252").decode(bytes));
    const utf16 = printableRuns(new TextDecoder("utf-16le").decode(bytes));
    return `${singleByte}\n${utf16}`.slice(0, options.maxTextChars);
  }

  async function extractText(file, customOptions = {}, dependencies = {}) {
    const type = fileType(file);
    if (!type) throw new AttachmentError("unsupported", "Formato de anexo não suportado");
    if (file.size > (customOptions.maxFileBytes || MAX_FILE_BYTES)) throw new AttachmentError("too-large", `O anexo excede ${Math.floor((customOptions.maxFileBytes || MAX_FILE_BYTES) / 1024 / 1024)} MB`);
    const options = {
      maxTextChars: customOptions.maxTextChars || MAX_TEXT_CHARS,
      maxPdfPages: customOptions.maxPdfPages || MAX_PDF_PAGES,
      maxDocxExpandedBytes: customOptions.maxDocxExpandedBytes || MAX_DOCX_EXPANDED_BYTES,
      timeoutMs: customOptions.timeoutMs || EXTRACTION_TIMEOUT_MS
    };
    options.deadline = Date.now() + options.timeoutMs;
    let text;
    if (type === "pdf") text = await extractPdf(file, options, dependencies);
    else if (type === "docx") text = await extractDocx(file, options, dependencies);
    else text = await extractLegacyDoc(file, options);
    const normalized = text.replace(/\u0000/g, "").trim();
    if (normalized.length < 4) throw new AttachmentError("no-text", "Documento sem texto extraível; remova-o ou aplique OCR antes do envio");
    return { type, text: normalized };
  }

  async function scanFile(file, analyze, settings, options, dependencies, analyzeFileName) {
    try {
      const extracted = await extractText(file, options, dependencies);
      const contentResult = analyze(extracted.text, settings);
      const fileNameResult = analyzeFileName ? analyzeFileName(file.name, settings) : null;
      const result = fileNameResult ? mergeResults(contentResult, fileNameResult) : contentResult;
      return { fileName: file.name || "documento", type: extracted.type, textLength: extracted.text.length, result };
    } catch (error) {
      if (analyzeFileName) {
        const result = analyzeFileName(file.name, settings);
        if (result.blocked || (error instanceof AttachmentError && error.code === "unsupported")) {
          return { fileName: file.name || "documento", type: "filename", textLength: 0, result, extractionError: error.message };
        }
      }
      throw error;
    }
  }

  function mergeResults(first, second) {
    const findings = [...first.findings, ...second.findings];
    const categoryScores = { ...first.categoryScores };
    for (const [category, score] of Object.entries(second.categoryScores || {})) categoryScores[category] = (categoryScores[category] || 0) + score;
    return {
      blocked: first.blocked || second.blocked,
      findings,
      categories: [...new Set([...first.categories, ...second.categories])],
      categoryScores,
      rulesVersion: second.rulesVersion || first.rulesVersion
    };
  }

  class Registry {
    constructor(scan, now = () => Date.now()) {
      this._scan = scan;
      this._now = now;
      this._records = new Map();
    }

    add(files) {
      const ids = [];
      for (const file of Array.from(files || [])) {
        const id = fingerprint(file);
        ids.push(id);
        if (this._records.has(id)) continue;
        const record = { id, fileName: file.name || "documento", status: "pending", createdAt: this._now(), scan: null, error: null };
        this._records.set(id, record);
        record.completion = Promise.resolve().then(() => this._scan(file)).then((scan) => {
          record.scan = scan;
          record.status = scan.result.blocked ? "blocked" : "safe";
        }).catch((error) => {
          record.error = error instanceof Error ? error.message : String(error);
          record.status = "error";
        });
      }
      return ids;
    }

    async wait(ids) {
      const records = (ids || []).map((id) => this._records.get(id)).filter(Boolean);
      await Promise.all(records.map((record) => record.completion));
      return records;
    }

    remove(ids) {
      for (const id of ids || []) this._records.delete(id);
    }

    removeByName(name) {
      for (const [id, record] of this._records) if (record.fileName === name) this._records.delete(id);
    }

    clear() {
      this._records.clear();
    }

    state() {
      const cutoff = this._now() - RECORD_TTL_MS;
      for (const [id, record] of this._records) if (record.createdAt < cutoff) this._records.delete(id);
      const records = [...this._records.values()];
      return {
        pending: records.filter((record) => record.status === "pending"),
        errors: records.filter((record) => record.status === "error"),
        blocked: records.filter((record) => record.status === "blocked"),
        safe: records.filter((record) => record.status === "safe")
      };
    }
  }

  return Object.freeze({ extractText, scanFile, fileType, fingerprint, Registry, AttachmentError, limits: Object.freeze({ MAX_FILE_BYTES, MAX_TEXT_CHARS, MAX_PDF_PAGES, MAX_DOCX_EXPANDED_BYTES }) });
});
