(function exposeDetector(root, factory) {
  const catalog = typeof module === "object" && module.exports ? require("./rules.js") : root.AISafetyGuardRules;
  const api = factory(catalog);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AISafetyGuard = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createDetector(catalog) {
  "use strict";

  const HIGH_CONFIDENCE = 80;
  const MEDIUM_CONFIDENCE = 50;
  const CHECKSUM_IDENTIFIERS = new Set(["cpf", "cnpj", "pis"]);
  const CONTEXT_RADIUS = 160;
  const NEGATIVE_CONTEXT = /\b(?:exemplo|example|mock|teste|test data|placeholder|dummy|fict[ií]cio|sample|regex|express[aã]o regular|documenta[cç][aã]o)\b/i;
  const PLACEHOLDER = /(?:example|dummy|placeholder|changeme|replace[_-]?me|your[_-]?(?:key|token|secret)|x{4,}|\*{4,})/i;
  const CATEGORIES = {};
  let compiledPatterns = [];
  let compiledFileNameRules = [];

  function compareVersions(left, right) {
    const a = String(left).split(".").map(Number);
    const b = String(right).split(".").map(Number);
    for (let index = 0; index < 3; index += 1) if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
    return 0;
  }

  function compileCatalog(nextCatalog) {
    if (!nextCatalog || typeof nextCatalog.version !== "string" || !nextCatalog.categories || !Array.isArray(nextCatalog.patterns) || !nextCatalog.keywords || !Array.isArray(nextCatalog.heuristics)) throw new Error("Catálogo de regras DLP inválido");
    const supportedValidators = [null, undefined, "luhn", "iban", "cpf", "cnpj", "pis"];
    const patterns = nextCatalog.patterns.map((item) => {
      if (!nextCatalog.categories[item.category] || typeof item.source !== "string" || item.source.length > 5000 || typeof item.score !== "number" || !supportedValidators.includes(item.validator)) throw new Error("Regra de padrão inválida");
      return { ...item, regex: new RegExp(item.source, item.flags) };
    });
    const fileNameRules = (nextCatalog.fileNameRules || []).map((item) => {
      if (!nextCatalog.categories[item.category] || typeof item.label !== "string" || !Array.isArray(item.names) || !item.names.length || typeof item.score !== "number") throw new Error("Regra de nome de arquivo inválida");
      return { ...item, normalizedNames: new Set(item.names.map(normalizeFileName)) };
    });
    for (const [category, words] of Object.entries(nextCatalog.keywords)) {
      if (!nextCatalog.categories[category] || !Array.isArray(words) || words.some((word) => typeof word !== "string")) throw new Error("Regra de palavra-chave inválida");
    }
    for (const heuristic of nextCatalog.heuristics) {
      if (!nextCatalog.categories[heuristic.category] || typeof heuristic.id !== "string" || typeof heuristic.score !== "number") throw new Error("Regra heurística inválida");
    }
    for (const key of Object.keys(CATEGORIES)) delete CATEGORIES[key];
    Object.assign(CATEGORIES, nextCatalog.categories);
    compiledPatterns = patterns;
    compiledFileNameRules = fileNameRules;
    catalog = nextCatalog;
  }

  const digits = (value) => String(value || "").replace(/\D/g, "");
  const hasRepeatedDigits = (value) => /^(\d)\1+$/.test(value);

  function isLuhnMatch(value) {
    const number = digits(value);
    let sum = 0;
    let doubleDigit = false;
    for (let index = number.length - 1; index >= 0; index -= 1) {
      let digit = Number(number[index]);
      if (doubleDigit) { digit *= 2; if (digit > 9) digit -= 9; }
      sum += digit;
      doubleDigit = !doubleDigit;
    }
    return number.length >= 13 && number.length <= 19 && !hasRepeatedDigits(number) && sum % 10 === 0;
  }

  function isIbanMatch(value) {
    const iban = String(value || "").replace(/\s/g, "").toUpperCase();
    const rearranged = iban.slice(4) + iban.slice(0, 4);
    let remainder = 0;
    for (const character of rearranged) {
      const numeric = /[A-Z]/.test(character) ? String(character.charCodeAt(0) - 55) : character;
      for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
    }
    return iban.length >= 15 && iban.length <= 34 && remainder === 1;
  }

  function isCpfMatch(value) {
    const number = digits(value);
    if (number.length !== 11 || hasRepeatedDigits(number)) return false;
    const check = (length) => {
      let sum = 0;
      for (let index = 0; index < length; index += 1) sum += Number(number[index]) * (length + 1 - index);
      const remainder = (sum * 10) % 11;
      return remainder === 10 ? 0 : remainder;
    };
    return check(9) === Number(number[9]) && check(10) === Number(number[10]);
  }

  function isCnpjMatch(value) {
    const number = digits(value);
    if (number.length !== 14 || hasRepeatedDigits(number)) return false;
    const calculate = (length) => {
      const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const sum = weights.reduce((total, weight, index) => total + Number(number[index]) * weight, 0);
      const remainder = sum % 11;
      return remainder < 2 ? 0 : 11 - remainder;
    };
    return calculate(12) === Number(number[12]) && calculate(13) === Number(number[13]);
  }

  function isPisMatch(value) {
    const number = digits(value);
    if (number.length !== 11 || hasRepeatedDigits(number)) return false;
    const weights = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((total, weight, index) => total + Number(number[index]) * weight, 0);
    const remainder = 11 - (sum % 11);
    return (remainder === 10 || remainder === 11 ? 0 : remainder) === Number(number[10]);
  }

  const validators = Object.freeze({ luhn: isLuhnMatch, iban: isIbanMatch, cpf: isCpfMatch, cnpj: isCnpjMatch, pis: isPisMatch });

  function normalizeText(value) {
    return String(value || "").normalize("NFKC").replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").replace(/\u00A0/g, " ").replace(/[\t\f\v ]+/g, " ").replace(/ *\r?\n */g, "\n");
  }

  function redact(value) {
    const normalized = normalizeText(value).replace(/\s+/g, " ").trim();
    if (normalized.length <= 8) return "••••";
    return `${normalized.slice(0, 3)}••••${normalized.slice(-3)}`;
  }

  const clampScore = (value) => Math.max(0, Math.min(100, Math.round(value)));
  const contextWindow = (text, index, length) => text.slice(Math.max(0, index - CONTEXT_RADIUS), Math.min(text.length, index + length + CONTEXT_RADIUS));

  function hasLabelContext(text, index) {
    const lineStart = text.lastIndexOf("\n", index - 1) + 1;
    return /[\p{L}][\p{L}\d _./()-]{1,45}\s*[:=#-]\s*$/u.test(text.slice(lineStart, index));
  }

  function hasKeywordContext(category, windowText) {
    const lower = windowText.toLocaleLowerCase("pt-BR");
    return (catalog.keywords[category] || []).some((word) => lower.includes(normalizeText(word).toLocaleLowerCase("pt-BR")));
  }

  const isMasked = (value) => /(?:\*{3,}|•{3,}|x{4,})/i.test(value);

  function addFinding(findings, finding) {
    const duplicate = findings.some((item) => item.category === finding.category && item.label === finding.label && item.sample === finding.sample);
    if (!duplicate && finding.score > 0) findings.push({ ...finding, score: clampScore(finding.score) });
  }

  function detectPixContext(text, findings) {
    const pixWindow = /(?:chave\s+pix|pix(?:\s+chave)?)\s*[:=-]?\s*([^\s,;]+)/gi;
    const candidates = { "Chave PIX e-mail": /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/, "Chave PIX telefone": /^\+?55?\d{10,11}$/, "Chave PIX CPF": /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/ };
    for (const match of text.matchAll(pixWindow)) {
      for (const [label, regex] of Object.entries(candidates)) {
        if (!regex.test(match[1]) || (label === "Chave PIX CPF" && !isCpfMatch(match[1]))) continue;
        const negative = NEGATIVE_CONTEXT.test(contextWindow(text, match.index, match[0].length));
        addFinding(findings, { category: "financial", label, family: "pattern", score: 85 - (negative ? 25 : 0), sample: redact(match[1]), reasons: negative ? ["contexto negativo"] : ["contexto PIX"] });
      }
    }
  }

  function facts(text) {
    return { text, lower: text.toLocaleLowerCase("pt-BR"), lines: text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) };
  }

  const heuristicHandlers = Object.freeze({
    officialDocument({ text, lines }) {
      const labels = lines.filter((line) => /^[\p{L}][\p{L}\s/.-]{2,30}:\s*\S+/u.test(line)).length;
      return labels >= 3 && /secretaria (?:de|da)|república federativa|minist[eé]rio|órgão emissor|data (?:de )?expedição|expedido em|emissão\s*:/i.test(text) ? "rótulos e cabeçalho oficial" : null;
    },
    clinicalDocument({ text, lines }) {
      const indicators = [/(?:dr\.?|dra\.?)\s+.+|(?:clínica|clinica|hospital)\s+/i.test(lines.slice(0, 4).join(" ")), /paciente\s*:|nome do paciente|dados do paciente/i.test(text), /medicamento|diagnóstico|diagnostico|quadro clínico|quadro clinico/i.test(text), /assinatura|carimbo/i.test(lines.slice(-5).join(" "))];
      return indicators.filter(Boolean).length >= 3 ? "profissional, paciente e conteúdo clínico" : null;
    },
    financialStatement({ text, lower }) {
      const columns = ["data", "histórico", "historico", "débito", "debito", "crédito", "credito", "saldo"].filter((word) => lower.includes(word)).length;
      return columns >= 4 && /banco|instituição financeira|instituicao financeira|agência|agencia/i.test(text) ? "tabela de movimentações bancárias" : null;
    },
    corporateContract({ text, lines }) {
      const clauses = (text.match(/(?:cláusula|clausula)\s+(?:\d+|[ivxlcdm]+)/gi) || []).length;
      return clauses >= 2 && /contratante|contratada|outorgante|outorgado|doravante denominada/i.test(text) && /testemunhas?|assinaturas?/i.test(lines.slice(-8).join(" ")) ? "partes, cláusulas e assinaturas" : null;
    },
    encodedConfigSecret({ text }) {
      const assignments = (text.match(/^[A-Z][A-Z0-9_]{2,}\s*[:=]\s*\S+/gm) || []).length;
      const encoded = (text.match(/\b(?:[A-Fa-f0-9]{40,}|[A-Za-z0-9+/]{48,}={0,2})\b/g) || []).length;
      return assignments >= 2 && encoded >= 1 ? "variáveis e cadeia codificada" : null;
    },
    plaintextConfig({ text }) {
      const file = /(?:^|[\s/\\])(?:\.env(?:\.\w+)?|[\w.-]+\.(?:ya?ml|json))\b/i.test(text);
      const secret = /(?:password|passwd|db_password|database_url|aws_secret_access_key|redis_auth)\s*[:=]\s*["']?[^\s"'{}]{4,}/i.test(text);
      return file && secret ? "arquivo .env/.yaml/.json com segredo legível" : null;
    },
    publicCodeShare({ text }) {
      const publicShare = /https?:\/\/(?:gist\.github\.com|pastebin\.com|github\.com\/[^\s/]+\/[^\s/]+)/i.test(text);
      const source = /```|\b(?:class|function|const|private|public|import|package)\s+[\w{*@]/i.test(text);
      const marking = /confidential|proprietary|internal use only|do_not_distribute|trade_secret/i.test(text);
      return publicShare && source && marking ? "código interno associado a Gist, Pastebin ou repositório público" : null;
    },
    unmaskedPaymentLog({ text }) {
      const context = /(?:log|logger|request_body|response_body|payload)/i.test(text);
      const fields = /["'](?:card_number|pan|cvv|cvc|expiration_month|track2)["']\s*:/i.test(text);
      const value = /(?:\d[ -]?){12,19}|["']\d{3,4}["']/i.test(text);
      return context && fields && value ? "payload/log contém campos de pagamento não mascarados" : null;
    },
    payrollTable({ text, lower, lines }) {
      const file = /\b[\w.-]+\.(?:csv|xlsx)\b/i.test(text);
      const headers = ["nome", "cpf", "cargo", "salário"].filter((header) => lower.includes(header)).length;
      const rows = lines.filter((line) => (line.match(/[,;|\t]/g) || []).length >= 3).length;
      return file && headers === 4 && rows >= 1 ? "arquivo CSV/XLSX com Nome, CPF, Cargo e Salário" : null;
    },
    unsanitizedObservability({ text }) {
      const platform = /elasticsearch|datadog/i.test(text);
      const formData = /(?:request_body|form_data|payload).*(?:nome|email|cpf|password)|(?:nome|email|cpf|password).*(?:request_body|form_data|payload)/is.test(text);
      return platform && formData ? "telemetria contém dados de formulário sem indicação de sanitização" : null;
    }
  });

  function aggregateCategoryScores(findings) {
    const grouped = {};
    for (const finding of findings) {
      const category = grouped[finding.category] || (grouped[finding.category] = new Map());
      const key = `${finding.family}:${finding.label}`;
      category.set(key, Math.max(category.get(key) || 0, finding.score));
    }
    const scores = {};
    for (const [category, evidence] of Object.entries(grouped)) {
      const values = [...evidence.values()].sort((left, right) => right - left);
      scores[category] = clampScore((values[0] || 0) + (values[1] || 0) * 0.35 + (values[2] || 0) * 0.15);
    }
    return scores;
  }

  function resultFromFindings(findings, rulesVersion = catalog.version) {
    const categoryScores = aggregateCategoryScores(findings);
    const confidence = Math.max(0, ...Object.values(categoryScores));
    const decision = confidence >= HIGH_CONFIDENCE ? "block" : confidence >= MEDIUM_CONFIDENCE ? "warn" : "allow";
    return { decision, confidence, confidenceLevel: decision === "block" ? "high" : decision === "warn" ? "medium" : "low", blocked: decision === "block", findings, categories: [...new Set(findings.map((finding) => finding.category))], categoryScores, rulesVersion };
  }

  function analyze(text, options) {
    const input = normalizeText(text);
    const enabledCategories = new Set((options && options.enabledCategories) || Object.keys(CATEGORIES));
    const findings = [];
    for (const item of compiledPatterns) {
      if (!enabledCategories.has(item.category)) continue;
      item.regex.lastIndex = 0;
      for (const match of input.matchAll(item.regex)) {
        const value = match[0];
        if (isMasked(value) || PLACEHOLDER.test(value)) continue;
        const validate = item.validator ? validators[item.validator] : null;
        const validatorApproved = !item.validator || (validate && validate(value));
        if (!validatorApproved) {
          if (CHECKSUM_IDENTIFIERS.has(item.validator)) {
            addFinding(findings, {
              category: item.category,
              label: item.label,
              family: "pattern",
              score: MEDIUM_CONFIDENCE,
              baseScore: item.score,
              sample: redact(value),
              reasons: ["formato de identificador sensível", "checksum inválido"]
            });
          }
          continue;
        }
        const windowText = contextWindow(input, match.index, value.length);
        const negative = NEGATIVE_CONTEXT.test(windowText);
        const reasons = [];
        let score = item.score;
        if (item.validator) { score += 10; reasons.push("validador aprovado"); }
        if (!negative && hasLabelContext(input, match.index)) { score += 10; reasons.push("rótulo próximo"); }
        if (!negative && hasKeywordContext(item.category, windowText)) { score += 10; reasons.push("contexto da categoria"); }
        if (negative) { score -= 25; reasons.push("contexto negativo"); }
        if (item.score >= 100) score = Math.max(score, HIGH_CONFIDENCE);
        addFinding(findings, { category: item.category, label: item.label, family: "pattern", score, baseScore: item.score, sample: redact(value), reasons });
      }
    }
    if (enabledCategories.has("financial")) detectPixContext(input, findings);

    const documentFacts = facts(input);
    for (const heuristic of catalog.heuristics) {
      if (!enabledCategories.has(heuristic.category)) continue;
      const handler = heuristicHandlers[heuristic.id];
      const sample = handler ? handler(documentFacts) : null;
      if (!sample) continue;
      const negative = NEGATIVE_CONTEXT.test(input);
      addFinding(findings, { category: heuristic.category, label: heuristic.label, family: "structure", score: heuristic.score - (negative ? 25 : 0), baseScore: heuristic.score, sample, reasons: negative ? ["contexto negativo"] : ["estrutura documental"] });
    }

    const structuredCategories = new Set(findings.filter((finding) => finding.family === "structure").map((finding) => finding.category));
    for (const finding of findings) {
      if (finding.family !== "structure" && structuredCategories.has(finding.category)) {
        finding.score = clampScore(finding.score + 15);
        finding.reasons.push("estrutura correlacionada");
      }
    }

    for (const [category, words] of Object.entries(catalog.keywords)) {
      if (!enabledCategories.has(category)) continue;
      const matched = words.filter((word) => documentFacts.lower.includes(normalizeText(word).toLocaleLowerCase("pt-BR")));
      if (!matched.length) continue;
      const negative = NEGATIVE_CONTEXT.test(input);
      const baseScore = Math.min(25 + (matched.length - 1) * 15, 55);
      const score = baseScore - (negative ? 25 : 0) + (structuredCategories.has(category) ? 15 : 0);
      addFinding(findings, { category, label: "Termos sensíveis", family: "keyword", score, baseScore, sample: matched.slice(0, 3).join(", "), reasons: [structuredCategories.has(category) ? "estrutura correlacionada" : "palavra-chave", ...(negative ? ["contexto negativo"] : [])] });
    }
    return resultFromFindings(findings);
  }

  function normalizeFileName(value) {
    const basename = normalizeText(value).replace(/\\/g, "/").split("/").pop().trim().toLocaleLowerCase("pt-BR");
    return basename.replace(/\s*\(\d+\)(?=\.[^.]+$)/, "");
  }

  function analyzeFileName(fileName, options) {
    const enabledCategories = new Set((options && options.enabledCategories) || Object.keys(CATEGORIES));
    if (!enabledCategories.has("sensitiveFileNames")) return resultFromFindings([]);
    const normalized = normalizeFileName(fileName);
    const findings = [];
    for (const rule of compiledFileNameRules) {
      if (rule.normalizedNames.has(normalized)) addFinding(findings, { category: rule.category, label: rule.label, family: "filename", score: Math.min(rule.score, 60), baseScore: rule.score, sample: normalized, source: fileName, reasons: ["nome de arquivo sensível"] });
    }
    return resultFromFindings(findings);
  }

  function updateCatalog(nextCatalog) {
    if (compareVersions(nextCatalog.version, catalog.version) < 0) throw new Error("Catálogo remoto é mais antigo que o catálogo ativo");
    compileCatalog(nextCatalog);
    return catalog.version;
  }

  compileCatalog(catalog);
  return Object.freeze({ analyze, analyzeFileName, updateCatalog, CATEGORIES, get version() { return catalog.version; }, _internal: Object.freeze({ isLuhnMatch, isIbanMatch, isCpfMatch, isCnpjMatch, isPisMatch, normalizeText, redact, normalizeFileName, aggregateCategoryScores, resultFromFindings }) });
});
