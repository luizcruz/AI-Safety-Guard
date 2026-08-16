(function exposeDetector(root, factory) {
  const catalog = typeof module === "object" && module.exports ? require("./rules.js") : root.AISafetyGuardRules;
  const api = factory(catalog);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AISafetyGuard = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createDetector(catalog) {
  "use strict";

  if (!catalog || !catalog.categories || !catalog.patterns) throw new Error("Catálogo de regras DLP indisponível");
  const CATEGORIES = catalog.categories;
  const compiledPatterns = catalog.patterns.map((item) => ({ ...item, regex: new RegExp(item.source, item.flags) }));

  function isLuhnMatch(value) {
    const digits = value.replace(/\D/g, "");
    let sum = 0;
    let doubleDigit = false;
    for (let i = digits.length - 1; i >= 0; i -= 1) {
      let digit = Number(digits[i]);
      if (doubleDigit) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      doubleDigit = !doubleDigit;
    }
    return sum % 10 === 0;
  }

  function isIbanMatch(value) {
    const iban = value.replace(/\s/g, "").toUpperCase();
    const rearranged = iban.slice(4) + iban.slice(0, 4);
    let remainder = 0;
    for (const character of rearranged) {
      const numeric = /[A-Z]/.test(character) ? String(character.charCodeAt(0) - 55) : character;
      for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
    }
    return remainder === 1;
  }

  const validators = Object.freeze({ luhn: isLuhnMatch, iban: isIbanMatch });

  function redact(value) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length <= 8) return "••••";
    return `${normalized.slice(0, 3)}••••${normalized.slice(-3)}`;
  }

  function addFinding(findings, finding) {
    if (!findings.some((item) => item.category === finding.category && item.label === finding.label && item.sample === finding.sample)) findings.push(finding);
  }

  function detectPixContext(text, findings) {
    const pixWindow = /(?:chave\s+pix|pix(?:\s+chave)?)\s*[:=-]?\s*([^\s,;]+)/gi;
    const candidates = {
      "Chave PIX e-mail": /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/,
      "Chave PIX telefone": /^\+?55?\d{10,11}$/,
      "Chave PIX CPF": /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/
    };
    for (const match of text.matchAll(pixWindow)) {
      for (const [label, regex] of Object.entries(candidates)) {
        if (regex.test(match[1])) addFinding(findings, { category: "financial", label, score: 85, sample: redact(match[1]) });
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

  function analyze(text, options) {
    const input = String(text || "");
    const enabledCategories = new Set((options && options.enabledCategories) || Object.keys(CATEGORIES));
    const findings = [];
    for (const item of compiledPatterns) {
      if (!enabledCategories.has(item.category)) continue;
      item.regex.lastIndex = 0;
      for (const match of input.matchAll(item.regex)) {
        const validate = item.validator ? validators[item.validator] : null;
        if (!item.validator || (validate && validate(match[0]))) addFinding(findings, { category: item.category, label: item.label, score: item.score, sample: redact(match[0]) });
      }
    }
    if (enabledCategories.has("financial")) detectPixContext(input, findings);

    const documentFacts = facts(input);
    for (const heuristic of catalog.heuristics) {
      if (!enabledCategories.has(heuristic.category)) continue;
      const sample = heuristicHandlers[heuristic.id](documentFacts);
      if (sample) addFinding(findings, { category: heuristic.category, label: heuristic.label, score: heuristic.score, sample });
    }
    for (const [category, words] of Object.entries(catalog.keywords)) {
      if (!enabledCategories.has(category)) continue;
      const matched = words.filter((word) => documentFacts.lower.includes(word));
      if (matched.length) addFinding(findings, { category, label: "Termos sensíveis", score: Math.min(40 + matched.length * 10, 70), sample: matched.slice(0, 3).join(", ") });
    }

    const categoryScores = {};
    for (const finding of findings) categoryScores[finding.category] = (categoryScores[finding.category] || 0) + finding.score;
    return {
      blocked: findings.some((finding) => finding.score >= 70) || Object.values(categoryScores).some((score) => score >= 50),
      findings,
      categories: [...new Set(findings.map((finding) => finding.category))],
      categoryScores,
      rulesVersion: catalog.version
    };
  }

  return Object.freeze({ analyze, CATEGORIES, _internal: Object.freeze({ isLuhnMatch, isIbanMatch, redact }) });
});
