#!/usr/bin/env node
"use strict";
const __modules = {
"./rules.js": function(module, exports, require) {
(function exposeRuleCatalog(root, factory) {
  const catalog = factory();
  if (typeof module === "object" && module.exports) module.exports = catalog;
  root.AISafetyGuardRules = catalog;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRuleCatalog() {
  "use strict";

  return Object.freeze({
    version: "1.3.0",
    categories: Object.freeze({
      personal: "Documentos pessoais",
      medical: "Documentos médicos",
      financial: "Documentos financeiros",
      corporate: "Documentos corporativos",
      credentials: "Credenciais e chaves de acesso",
      infrastructure: "Infraestrutura e bancos de dados",
      intellectualProperty: "Propriedade intelectual e código-fonte",
      pciBanking: "Dados de cartão e transações globais (PCI/Banking)",
      hrPayroll: "Registros de RH e folha de pagamento",
      telemetryLogs: "PII em telemetria e logs de aplicação",
      sensitiveFileNames: "Nomes de arquivos sensíveis"
    }),
    patterns: Object.freeze([
      p("personal", "CPF", "\\b\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}\\b", "g", 90, "cpf"),
      p("personal", "RG", "\\b\\d{2}\\.\\d{3}\\.\\d{3}-[\\dXx]\\b", "g", 85),
      p("personal", "Passaporte", "\\b[A-Z]{2}\\d{6}\\b", "g", 85),
      p("personal", "CNH", "\\b(?:CNH|Carteira Nacional de Habilita(?:ç|c)ão)\\s*[:#-]?\\s*\\d{11}\\b", "gi", 85),
      p("personal", "PIS/PASEP", "\\b(?:PIS|PASEP)\\s*[:#-]?\\s*\\d{3}[. ]?\\d{5}[. ]?\\d{2}[- ]?\\d\\b", "gi", 85, "pis"),
      p("medical", "Registro profissional", "\\b(?:CRM|CRO|COREN)\\s*\\/?\\s*[A-Z]{2}\\s*[-:]?\\s*\\d{3,10}\\b", "gi", 75),
      p("medical", "Código CID", "\\bCID(?:-?10|-?11)?\\s*[:#-]?\\s*[A-Z]\\d{2}(?:\\.\\d{1,2})?\\b", "gi", 75),
      p("medical", "Posologia", "\\b\\d+(?:[.,]\\d+)?\\s*(?:mg|ml|mcg|gotas?)\\b", "gi", 55),
      p("financial", "Linha digitável de boleto", "\\b\\d{5}\\.\\d{5}\\s+\\d{5}\\.\\d{6}\\s+\\d{5}\\.\\d{6}\\s+\\d\\s+\\d{14}\\b", "g", 95),
      p("financial", "Chave PIX UUID", "\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b", "gi", 85),
      p("financial", "Valor monetário", "R\\$\\s?\\d{1,3}(?:\\.\\d{3})*(?:,\\d{2})?|R\\$\\s?\\d+(?:[.,]\\d{2})?", "gi", 25),
      p("corporate", "CNPJ", "\\b\\d{2}\\.\\d{3}\\.\\d{3}\\/\\d{4}-\\d{2}\\b", "g", 85, "cnpj"),
      p("corporate", "Inscrição Estadual", "\\b(?:I\\.?E\\.?|Inscri(?:ç|c)ão Estadual)\\s*[:#-]?\\s*[\\d.\\/-]{6,18}\\b", "gi", 70),
      p("corporate", "Número de processo/contrato", "\\b(?:processo|contrato)\\s*(?:n[º°o.]*)?\\s*[:#-]?\\s*[\\d./-]{6,25}\\b", "gi", 55),
      p("credentials", "Chave de acesso AWS", "\\bAKIA[0-9A-Z]{16}\\b", "g", 100),
      p("credentials", "Token JWT", "\\beyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\b", "g", 100),
      p("credentials", "Chave privada", "-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", "g", 100),
      p("credentials", "Senha declarada", "[\\\"']?(?:password|passwd|pwd|db_pass)[\\\"']?\\s*[:=]\\s*[\\\"'][^\\\"'\\r\\n]{4,}[\\\"']", "gi", 100),
      p("credentials", "Hash MD5/SHA-256", "\\b(?:[a-f\\d]{32}|[a-f\\d]{64})\\b", "gi", 55),
      p("infrastructure", "String de conexão", "\\b(?:postgres|mysql|mongodb(?:\\+srv)?|redis):\\/\\/[^\\s\\\"']+", "gi", 100),
      p("infrastructure", "Bucket S3 exposto", "https:\\/\\/[a-z0-9.-]+\\.s3\\.amazonaws\\.com(?:\\/[^\\s]*)?", "gi", 85),
      p("infrastructure", "IP de rede privada", "\\b(?:10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|192\\.168\\.\\d{1,3}\\.\\d{1,3})\\b", "g", 55),
      p("infrastructure", "Estado do Terraform", "\\b[\\w./\\\\-]+\\.tfstate\\b", "gi", 75),
      p("intellectualProperty", "Aviso de copyright corporativo", "Copyright\\s+\\(c\\)\\s+\\d{4}(?:-\\d{4})?\\s+[A-ZÀ-Ý][^\\r\\n]{2,80}", "gi", 55),
      p("intellectualProperty", "Pacote privado", "@[a-z0-9._-]+\\/[a-z0-9._-]*(?:internal|interno|private|privado)[a-z0-9._-]*", "gi", 75),
      p("pciBanking", "Cartão de pagamento", "\\b\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b", "g", 90, "luhn"),
      p("pciBanking", "IBAN", "\\b[A-Z]{2}\\d{2}[A-Z0-9]{11,30}\\b", "g", 90, "iban"),
      p("pciBanking", "SWIFT/BIC", "\\b(?:SWIFT|BIC)\\s*[:#-]?\\s*[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\\b", "g", 80),
      p("pciBanking", "CVV/CVC exposto", "[\\\"']?(?:cvv|cvc)[\\\"']?\\s*:\\s*[\\\"']\\d{3,4}[\\\"']", "gi", 100),
      p("hrPayroll", "Matrícula funcional", "\\b[A-Z]{2,3}-\\d{4,8}\\b", "g", 55),
      p("hrPayroll", "Valor salarial", "R\\$\\s?\\d{1,3}(?:\\.\\d{3})*,\\d{2}", "g", 25),
      p("telemetryLogs", "Credencial em parâmetro GET", "[?&](?:pass(?:word)?|token)=[^&\\s]+", "gi", 90),
      p("telemetryLogs", "Stacktrace", "(?:^|\\n)\\s*(?:at\\s+.+\\([^\\n]+:\\d+:\\d+\\)|Caused by:\\s+[\\w.$]+|Traceback \\(most recent call last\\))", "gm", 65),
      p("telemetryLogs", "Bearer token em log", "Authorization\\s*:\\s*Bearer\\s+[A-Za-z0-9._~+\\/-]+=*", "gi", 100)
    ]),
    keywords: Object.freeze({
      personal: ["data de nascimento", "filiação", "filiacao", "nome da mãe", "nome da mae", "certidão de nascimento", "certidao de nascimento", "certidão de casamento", "certidao de casamento", "título de eleitor", "titulo de eleitor", "órgão emissor", "orgao emissor"],
      medical: ["receita médica", "receita medica", "atestado", "prontuário", "prontuario", "posologia", "diagnóstico", "diagnostico", "laudo acompanhante", "uso contínuo", "uso continuo", "solicitação de exames", "solicitacao de exames"],
      financial: ["comprovante de transferência", "comprovante de transferencia", "extrato bancário", "extrato bancario", "informe de rendimentos", "irpf", "fatura", "autenticação bancária", "autenticacao bancaria", "agência/conta", "agencia/conta"],
      corporate: ["razão social", "razao social", "nome fantasia", "contrato social", "acordo de confidencialidade", "nda", "procuração", "procuracao", "ata de assembleia", "cláusula", "clausula", "foro de eleição", "foro de eleicao"],
      credentials: ["secret_key", "api_key", "access_token", "bearer_token", "connection_string", "private_key", "db_pass"],
      infrastructure: ["database_url", "db_password", "kubeconfig", "aws_secret_access_key", "redis_auth"],
      intellectualProperty: ["confidential", "proprietary", "internal use only", "do_not_distribute", "trade_secret"],
      pciBanking: ["track2", "pan_truncated", "expiration_month", "card_security_code", "stripe_secret_key"],
      hrPayroll: ["demonstrativo de pagamento", "holerite", "plano de demissão", "plano de demissao", "bônus executivo", "bonus executivo", "avaliação de desempenho", "avaliacao de desempenho", "stock options"],
      telemetryLogs: ["stacktrace", "uncaught exception", "authorization: bearer", "set-cookie", "request_body"]
    }),
    fileNameRules: Object.freeze([
      f("Arquivos de configuração e código", [".env", ".env.local", ".env.production", "config.json", "settings.py", "application.yml", "database.php", "terraform.tfstate", "kubeconfig", "docker-compose.yml", "id_rsa", "id_rsa.pub", "private.key", "certificate.pem", "credentials.csv"]),
      f("Documentos pessoais e identificação", ["cnh.pdf", "cnh_digital.pdf", "rg.jpg", "rg_frente_verso.pdf", "cpf.pdf", "passaporte.pdf", "titulo_eleitor.pdf", "certidao_nascimento.pdf", "certidao_casamento.pdf", "comprovante_residencia.pdf", "comprovante_endereco.pdf"]),
      f("Documentos médicos e de saúde", ["receita_medica.pdf", "atestado_medico.pdf", "atestado.pdf", "prontuario_paciente.pdf", "prontuario.pdf", "laudo_exame.pdf", "resultado_laboratorial.pdf", "exame_sangue.pdf", "solicitacao_exame.pdf", "receita_controle_especial.pdf"]),
      f("Documentos financeiros e fiscais", ["extrato_bancario.pdf", "extrato_conta.pdf", "comprovante_pix.pdf", "fatura_cartao.pdf", "fatura_consolidada.pdf", "informe_rendimentos.pdf", "declaracao_irpf.pdf", "irpf_2025.pdf", "balancete.xlsx", "relatorio_financeiro.xlsx", "fluxo_de_caixa.xlsx"]),
      f("Documentos de RH e folha de pagamento", ["holerite.pdf", "demonstrativo_pagamento.pdf", "contra_cheque.pdf", "folha_de_pagamento.xlsx", "tabela_salarial.xlsx", "salarios_2026.xlsx", "dados_colaboradores.csv", "lista_demissoes.xlsx", "bonus_executivos.xlsx", "avaliacao_desempenho.docx", "ficha_cadastral.pdf"]),
      f("Documentos corporativos e jurídicos", ["contrato_social.pdf", "estatuto_social.pdf", "nda.pdf", "nda_assinado.pdf", "termo_confidencialidade.pdf", "procuracao.pdf", "ata_assembleia.docx", "ata_reuniao_diretoria.pdf", "proposta_comercial_confidencial.pdf", "acordo_socios.pdf"]),
      f("Logs, diagnostic traces e backups", ["error.log", "app.log", "access.log", "debug.log", "production.log", "stacktrace.txt", "trace.json", "requests_dump.json", "dump.sql", "backup_database.sql", "db_backup.tar.gz"])
    ]),
    heuristics: Object.freeze([
      h("officialDocument", "personal", "Estrutura de documento oficial", 65),
      h("clinicalDocument", "medical", "Estrutura de documento clínico", 70),
      h("financialStatement", "financial", "Estrutura de extrato financeiro", 70),
      h("corporateContract", "corporate", "Estrutura de contrato corporativo", 75),
      h("encodedConfigSecret", "credentials", "Configuração com segredo codificado", 90),
      h("plaintextConfig", "infrastructure", "Arquivo de configuração com senha em texto puro", 100),
      h("publicCodeShare", "intellectualProperty", "Código potencialmente interno em compartilhamento público", 80),
      h("unmaskedPaymentLog", "pciBanking", "Payload de pagamento sem mascaramento", 100),
      h("payrollTable", "hrPayroll", "Tabela de RH/folha de pagamento", 90),
      h("unsanitizedObservability", "telemetryLogs", "PII não sanitizada em observabilidade", 90)
    ])
  });

  function p(category, label, source, flags, score, validator) {
    return Object.freeze({ category, label, source, flags, score, validator: validator || null });
  }
  function h(id, category, label, score) {
    return Object.freeze({ id, category, label, score });
  }
  function f(label, names) {
    return Object.freeze({ category: "sensitiveFileNames", label, names: Object.freeze(names), score: 90 });
  }
});

},
"./detector.js": function(module, exports, require) {
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

  function obfuscate(text, options = {}) {
    const input = String(text || "");
    const enabledCategories = new Set(options.enabledCategories || Object.keys(CATEGORIES));
    const ranges = [];
    const addRange = (start, end) => {
      if (Number.isInteger(start) && end > start) ranges.push({ start, end });
    };

    for (const item of compiledPatterns) {
      if (!enabledCategories.has(item.category)) continue;
      const flags = item.regex.flags.includes("g") ? item.regex.flags : `${item.regex.flags}g`;
      const regex = new RegExp(item.regex.source, flags);
      for (const match of input.matchAll(regex)) {
        const value = match[0];
        if (isMasked(value) || PLACEHOLDER.test(value)) continue;
        const validate = item.validator ? validators[item.validator] : null;
        const actionable = !item.validator || (validate && validate(value)) || CHECKSUM_IDENTIFIERS.has(item.validator);
        if (actionable) addRange(match.index, match.index + value.length);
      }
    }

    const lower = input.toLocaleLowerCase("pt-BR");
    for (const rawTerm of Array.isArray(options.sensitiveTerms) ? options.sensitiveTerms : []) {
      const term = String(rawTerm || "").trim();
      if (term.length < 3 || term.length > 256) continue;
      const needle = term.toLocaleLowerCase("pt-BR");
      let start = lower.indexOf(needle);
      while (start >= 0) {
        addRange(start, start + term.length);
        start = lower.indexOf(needle, start + term.length);
      }
    }

    if (!ranges.length) return input;
    ranges.sort((left, right) => left.start - right.start || right.end - left.end);
    const merged = [];
    for (const range of ranges) {
      const previous = merged.at(-1);
      if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
      else merged.push({ ...range });
    }
    let output = "";
    let cursor = 0;
    for (const range of merged) {
      output += `${input.slice(cursor, range.start)}[REDACTED]`;
      cursor = range.end;
    }
    return output + input.slice(cursor);
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
  return Object.freeze({ analyze, analyzeFileName, obfuscate, updateCatalog, CATEGORIES, get version() { return catalog.version; }, _internal: Object.freeze({ isLuhnMatch, isIbanMatch, isCpfMatch, isCnpjMatch, isPisMatch, normalizeText, redact, normalizeFileName, aggregateCategoryScores, resultFromFindings }) });
});

},
"./policies.js": function(module, exports, require) {
(function exposeHeuristicPolicies(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AISafetyPolicies = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createHeuristicPolicies() {
  "use strict";

  const CATEGORIES = Object.freeze(["personal", "medical", "financial", "corporate", "credentials", "infrastructure", "intellectualProperty", "pciBanking", "hrPayroll", "telemetryLogs"]);
  const SEVERITIES = Object.freeze(["medium", "high", "critical"]);
  const MAX_POLICIES = 50;
  const MAX_PROMPT_CONTEXT_LENGTH = 8_000;

  const DEFAULT_POLICIES = Object.freeze([
    policy("press-embargo", "Embargo e fontes jornalísticas", "corporate", "high", ["off the record", "sob embargo", "fonte anônima", "fonte me confirmou", "fonte confirmou"], ["matéria", "reportagem", "publicação", "jornalista"], ["embargo encerrado", "publicado oficialmente", "publicada oficialmente"], "Protege informações jornalísticas antes da publicação."),
    policy("unannounced-corporate", "Informação corporativa não anunciada", "corporate", "high", ["não divulgado", "não anunciado", "confidencial", "não publicar", "roadmap interno", "meta interna"], ["empresa", "produto", "projeto", "diretoria"], ["comunicado público", "já publicado", "site oficial"], "Distingue planejamento interno de informação já pública."),
    policy("credentials-secrets", "Credenciais e segredos", "credentials", "critical", ["senha", "password", "api key", "secret key", "access token", "token de acesso"], ["produção", "prod", "conta", "serviço", "autenticação"], ["placeholder", "exemplo", "dummy", "[redacted]", "changeme"], "Prioriza credenciais utilizáveis e reduz falsos positivos em exemplos."),
    policy("commercial-negotiation", "Negociação comercial", "corporate", "high", ["revenue share", "proposta comercial", "desconto negociado", "margem", "condição comercial"], ["cliente", "fornecedor", "parceiro", "contrato"], ["tabela pública", "preço de lista", "modelo de proposta"], "Identifica condições privadas sem bloquear materiais públicos."),
    policy("mergers-acquisitions", "Fusões e aquisições", "corporate", "critical", ["aquisição", "fusão", "due diligence", "term sheet", "data room", "memorando de entendimento"], ["alvo", "comprador", "valuation", "conselho"], ["fato relevante publicado", "notícia pública", "transação concluída"], "Protege transações estratégicas antes de anúncio oficial."),
    policy("financial-pre-release", "Resultados financeiros pré-divulgação", "financial", "critical", ["resultado preliminar", "ebitda", "forecast", "guidance", "receita projetada", "fechamento mensal"], ["trimestre", "orçamento", "board", "investidores"], ["balanço publicado", "release de resultados", "dados históricos públicos"], "Diferencia projeções internas de resultados publicados."),
    policy("people-decisions", "Decisões de pessoas e RH", "hrPayroll", "high", ["plano de demissão", "promoção", "avaliação de desempenho", "salário", "bônus executivo", "sucessão"], ["colaborador", "gestor", "matrícula", "folha"], ["vaga pública", "faixa salarial pública", "política genérica"], "Protege decisões individuais e planos ainda não comunicados."),
    policy("legal-privilege", "Privilégio jurídico e litígio", "corporate", "high", ["privilegiado e confidencial", "attorney-client", "parecer jurídico", "estratégia processual", "acordo judicial"], ["advogado", "processo", "contencioso", "jurídico"], ["decisão pública", "petição pública", "jurisprudência"], "Reconhece estratégia jurídica privada sem tratar toda referência legal como segredo."),
    policy("security-incident", "Incidentes e vulnerabilidades", "infrastructure", "critical", ["zero-day", "vulnerabilidade não divulgada", "incidente de segurança", "data breach", "exploit", "credencial comprometida"], ["produção", "impacto", "sistema afetado", "contenção"], ["cve publicado", "advisory público", "ambiente de laboratório"], "Prioriza falhas não públicas e incidentes ativos."),
    policy("customer-case", "Dados de clientes e chamados", "personal", "high", ["cliente afetado", "ticket", "chamado", "dados do cliente", "gravação da ligação", "contrato do cliente"], ["nome", "email", "conta", "protocolo"], ["cliente fictício", "dados anonimizados", "ambiente demo"], "Exige contexto de atendimento e respeita anonimização explícita."),
    policy("source-code-ip", "Código e propriedade intelectual", "intellectualProperty", "high", ["código proprietário", "trade secret", "algoritmo interno", "repositório privado", "internal use only"], ["fonte", "biblioteca", "arquitetura", "patente"], ["open source", "repositório público", "licença permissiva"], "Distingue implementação proprietária de código deliberadamente público."),
    policy("medical-case", "Caso clínico identificável", "medical", "critical", ["diagnóstico", "prontuário", "paciente", "prescrição", "resultado de exame"], ["nome", "data de nascimento", "cpf", "número do prontuário"], ["caso fictício", "dados anonimizados", "material didático"], "Considera a combinação de conteúdo clínico e identificadores." )
  ]);

  function policy(id, name, category, severity, terms, contextTerms, exceptions, description) {
    return Object.freeze({ id, name, category, severity, terms: Object.freeze(terms), contextTerms: Object.freeze(contextTerms), exceptions: Object.freeze(exceptions), description, enabled: true, builtIn: true });
  }

  function cleanText(value, maxLength) {
    return String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, maxLength);
  }

  function cleanList(value) {
    const items = Array.isArray(value) ? value : String(value || "").split(",");
    return [...new Set(items.map((item) => cleanText(item, 80)).filter((item) => item.length >= 2))].slice(0, 20);
  }

  function normalizePolicy(value, { builtIn = false } = {}) {
    if (!value || typeof value !== "object") throw new Error("Política inválida");
    const id = cleanText(value.id, 64).toLocaleLowerCase("en-US").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    const name = cleanText(value.name, 80);
    const description = cleanText(value.description, 240);
    const category = CATEGORIES.includes(value.category) ? value.category : "corporate";
    const severity = SEVERITIES.includes(value.severity) ? value.severity : "high";
    const terms = cleanList(value.terms);
    if (id.length < 3 || !name || !description || !terms.length) throw new Error("Política incompleta");
    return { id, name, description, category, severity, terms, contextTerms: cleanList(value.contextTerms), exceptions: cleanList(value.exceptions), enabled: value.enabled !== false, builtIn };
  }

  function normalizePolicies(stored) {
    const values = Array.isArray(stored) ? stored : [];
    const deletedBuiltInIds = getDeletedBuiltInPolicyIds(values);
    const byId = new Map(values.filter((item) => item && item.id && item.deleted !== true).map((item) => [String(item.id), item]));
    const defaults = DEFAULT_POLICIES
      .filter((item) => !deletedBuiltInIds.includes(item.id))
      .map((item) => {
        const storedValue = byId.get(item.id);
        return normalizePolicy(storedValue ? { ...item, ...storedValue, id: item.id } : item, { builtIn: true });
      });
    const custom = [];
    for (const item of values) {
      if (!item || DEFAULT_POLICIES.some((entry) => entry.id === item.id)) continue;
      try { custom.push(normalizePolicy(item)); } catch { /* ignore invalid stored policy */ }
    }
    return [...defaults, ...custom].slice(0, MAX_POLICIES);
  }

  function getDeletedBuiltInPolicyIds(stored) {
    const defaultIds = new Set(DEFAULT_POLICIES.map((item) => item.id));
    const values = Array.isArray(stored) ? stored : [];
    return [...new Set(values.filter((item) => item && item.deleted === true && defaultIds.has(String(item.id))).map((item) => String(item.id)))];
  }

  function serializePolicies(policies, deletedBuiltInIds = []) {
    const defaultIds = new Set(DEFAULT_POLICIES.map((item) => item.id));
    const markers = [...new Set(deletedBuiltInIds)].filter((id) => defaultIds.has(id)).map((id) => ({ id, deleted: true }));
    return [...normalizePolicies([...(Array.isArray(policies) ? policies : []), ...markers]), ...markers];
  }

  function hasBuiltInPolicyChanges(stored) {
    const values = Array.isArray(stored) ? stored : [];
    if (getDeletedBuiltInPolicyIds(values).length) return true;
    const byId = new Map(values.filter((item) => item && item.id && item.deleted !== true).map((item) => [String(item.id), item]));
    return DEFAULT_POLICIES.some((item) => {
      const storedValue = byId.get(item.id);
      if (!storedValue) return false;
      const current = normalizePolicy({ ...item, ...storedValue, id: item.id }, { builtIn: true });
      const initial = normalizePolicy(item, { builtIn: true });
      return JSON.stringify(current) !== JSON.stringify(initial);
    });
  }

  function addPolicy(policies, value) {
    const current = normalizePolicies(policies);
    const next = normalizePolicy(value);
    if (current.length >= MAX_POLICIES) throw new Error(`Limite de ${MAX_POLICIES} políticas atingido`);
    if (current.some((item) => item.id === next.id)) throw new Error("Já existe uma política com esse identificador");
    return [...current, next];
  }

  function evaluate(text, policies) {
    const input = cleanText(text, 12_000).toLocaleLowerCase("pt-BR");
    if (!input) return [];
    return normalizePolicies(policies).filter((item) => item.enabled).flatMap((item) => {
      const indicators = item.terms.filter((term) => input.includes(term.toLocaleLowerCase("pt-BR")));
      const contexts = item.contextTerms.filter((term) => input.includes(term.toLocaleLowerCase("pt-BR")));
      const exceptions = item.exceptions.filter((term) => input.includes(term.toLocaleLowerCase("pt-BR")));
      const contextSatisfied = !item.contextTerms.length || contexts.length > 0;
      return indicators.length && contextSatisfied && !exceptions.length ? [{ id: item.id, indicators, contexts }] : [];
    });
  }

  function toPromptContext(policies, text) {
    const active = normalizePolicies(policies).filter((item) => item.enabled);
    const localMatches = evaluate(text, active).map((item) => item.id);
    const matched = new Set(localMatches);
    const ordered = [...active].sort((left, right) => Number(matched.has(right.id)) - Number(matched.has(left.id)) || Number(left.builtIn) - Number(right.builtIn));
    const selected = [];
    for (const { id, name, description, category, severity, terms, contextTerms, exceptions } of ordered) {
      const next = [...selected, { id, name, description, category, severity, indicators: terms, requiredContext: contextTerms, exceptions }];
      if (JSON.stringify({ policies: next, localMatches }).length > MAX_PROMPT_CONTEXT_LENGTH) break;
      selected.push(next.at(-1));
    }
    return JSON.stringify({ policies: selected, localMatches });
  }

  return Object.freeze({ DEFAULT_POLICIES, CATEGORIES, SEVERITIES, MAX_POLICIES, MAX_PROMPT_CONTEXT_LENGTH, normalizePolicy, normalizePolicies, getDeletedBuiltInPolicyIds, serializePolicies, hasBuiltInPolicyChanges, addPolicy, evaluate, toPromptContext });
});

},
"./protection-policy.js": function(module, exports, require) {
(function exposeProtectionPolicy(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AISafetyProtectionPolicy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createProtectionPolicy() {
  "use strict";

  const DEFAULT_MODE = "detect";
  const MODES = Object.freeze(["log", "warn", DEFAULT_MODE, "heuristic"]);

  function normalizeMode(value) {
    if (value === "block") return DEFAULT_MODE;
    return MODES.includes(value) ? value : DEFAULT_MODE;
  }

  function actionFor(mode, decision) {
    if (decision === "allow") return "allow";
    const normalized = normalizeMode(mode);
    if (normalized === "log") return "log";
    if (normalized === "warn") return "warn";
    return "block";
  }

  function enforceNanoAvailability(mode, available) {
    const normalized = normalizeMode(mode);
    return normalized === "heuristic" && !available ? DEFAULT_MODE : normalized;
  }

  function createEmissionGate({ windowMs = 250, now = Date.now } = {}) {
    const recent = new Map();
    return function shouldEmit(channel, key) {
      const timestamp = now();
      const id = `${channel}:${key}`;
      const previous = recent.get(id);
      if (previous !== undefined && timestamp - previous < windowMs) return false;
      recent.set(id, timestamp);
      for (const [storedId, storedAt] of recent) if (timestamp - storedAt >= windowMs) recent.delete(storedId);
      return true;
    };
  }

  return Object.freeze({ DEFAULT_MODE, MODES, normalizeMode, actionFor, enforceNanoAvailability, createEmissionGate });
});

},
"./heuristic-evaluator.js": function(module, exports, require) {
(function exposeHeuristicEvaluator(root, factory) {
  const isCommonJs = typeof module === "object" && module.exports;
  const detector = isCommonJs ? require("./detector.js") : root && root.AISafetyGuard;
  const policies = isCommonJs ? require("./policies.js") : root && root.AISafetyPolicies;
  const protection = isCommonJs ? require("./protection-policy.js") : root && root.AISafetyProtectionPolicy;
  const api = factory(detector, policies, protection);
  if (isCommonJs) module.exports = api;
  if (root) root.AISafetyHeuristicEvaluator = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createHeuristicEvaluator(detector, policyApi, protectionApi) {
  "use strict";

  const MAX_TEXT_LENGTH = 100_000;
  const MAX_FINDINGS = 12;
  const POLICY_SCORE = Object.freeze({ medium: 65, high: 80, critical: 95 });

  function evaluatePrompt(text, config = {}) {
    const mode = protectionApi.normalizeMode(config.mode);
    if (mode !== "heuristic") return disabledResult(mode);
    const input = String(text || "").trim();
    if (!input) throw new Error("Prompt vazio");
    if (input.length > MAX_TEXT_LENGTH) throw new Error(`Prompt excede ${MAX_TEXT_LENGTH} caracteres`);

    const enabledCategories = Array.isArray(config.enabledCategories) && config.enabledCategories.length
      ? config.enabledCategories
      : Object.keys(detector.CATEGORIES);
    const normalizedPolicies = policyApi.normalizePolicies(config.policies);
    const deterministic = detector.analyze(input, { enabledCategories });
    const enabled = new Set(enabledCategories);
    const policyMatches = policyApi.evaluate(input, normalizedPolicies)
      .filter((match) => {
        const policy = normalizedPolicies.find((item) => item.id === match.id);
        return policy && enabled.has(policy.category);
      });
    const findings = deterministic.findings.slice(0, MAX_FINDINGS).map((finding) => ({
      source: finding.family === "structure" ? "heuristic-rule" : "deterministic-rule",
      category: finding.category,
      label: finding.label,
      score: Number(finding.score) || 0,
      reasons: Array.isArray(finding.reasons) ? finding.reasons.slice(0, 3) : []
    }));

    for (const match of policyMatches) {
      if (findings.length >= MAX_FINDINGS) break;
      const policy = normalizedPolicies.find((item) => item.id === match.id);
      findings.push({
        source: "heuristic-policy",
        category: policy.category,
        label: policy.name,
        score: POLICY_SCORE[policy.severity],
        policyId: policy.id,
        reasons: ["indicador e contexto de política correspondentes"]
      });
    }

    const confidence = Math.max(Number(deterministic.confidence) || 0, ...findings.map((finding) => finding.score));
    return finalize({
      mode,
      findings,
      confidence,
      policyIds: policyMatches.map((match) => match.id),
      engines: { deterministic: "evaluated", policies: "evaluated", semantic: "not-run" }
    });
  }

  function mergeSemantic(result, classification) {
    if (!result || !result.enabled) return result;
    const next = { ...result, findings: [...result.findings], policyIds: [...result.policyIds], engines: { ...result.engines, semantic: "evaluated" } };
    if (classification && classification.risk === true) {
      const score = POLICY_SCORE[classification.severity] || 65;
      next.findings.push({
        source: "gemini-nano",
        category: classification.category || "corporate",
        label: "Risco semântico local",
        score,
        reasons: [String(classification.reason || "Risco semântico identificado").replace(/[\r\n]+/g, " ").slice(0, 160)]
      });
      next.confidence = Math.max(next.confidence, score);
      next.policyIds = [...new Set([...next.policyIds, ...(Array.isArray(classification.policyIds) ? classification.policyIds : [])])].slice(0, 12);
    }
    return finalize(next);
  }

  function obfuscatePrompt(text, result, config = {}) {
    if (!result || !result.blocked || config.obfuscateSensitiveData !== true) return "";
    const matchedPolicyIds = new Set(Array.isArray(result.policyIds) ? result.policyIds : []);
    const sensitiveTerms = policyApi.normalizePolicies(config.policies)
      .filter((policy) => matchedPolicyIds.has(policy.id))
      .flatMap((policy) => policy.terms);
    const obfuscated = detector.obfuscate(String(text || ""), {
      enabledCategories: Array.isArray(config.enabledCategories) ? config.enabledCategories : undefined,
      sensitiveTerms
    });
    return obfuscated !== String(text || "") ? obfuscated : "";
  }

  function finalize(value) {
    const findings = value.findings.slice(0, MAX_FINDINGS);
    const categories = [...new Set(findings.map((finding) => finding.category))];
    const risk = findings.some((finding) => finding.score >= 50);
    return {
      version: 1,
      enabled: true,
      mode: value.mode,
      decision: risk ? "block" : "allow",
      blocked: risk,
      confidence: Math.max(0, Math.min(100, Number(value.confidence) || 0)),
      categories,
      policyIds: [...new Set(value.policyIds || [])].slice(0, 12),
      findings,
      engines: value.engines
    };
  }

  function disabledResult(mode) {
    return { version: 1, enabled: false, mode, decision: "allow", blocked: false, confidence: 0, categories: [], policyIds: [], findings: [], engines: { deterministic: "not-run", policies: "not-run", semantic: "not-run" } };
  }

  return Object.freeze({ evaluatePrompt, mergeSemantic, obfuscatePrompt, MAX_TEXT_LENGTH, MAX_FINDINGS });
});

},
"./standalone-entry.cjs": function(module, exports, require) {
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const evaluator = require("./heuristic-evaluator.js");
const detector = require("./detector.js");

const TOOL_NAME = "evaluate_prompt";
const MAX_CONFIG_BYTES = 256_000;
const MAX_MESSAGE_BYTES = 1_000_000;

if (process.argv.includes("--hook")) runHook().catch(failHook);
else runServer();

function runServer() {
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on("line", async (line) => {
    if (Buffer.byteLength(line, "utf8") > MAX_MESSAGE_BYTES) return writeError(null, -32600, "Request is too large");
    let request;
    try { request = JSON.parse(line); } catch { return writeError(null, -32700, "Parse error"); }
    if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") return writeError(request && request.id, -32600, "Invalid Request");
    if (request.id === undefined) return;
    try {
      writeResult(request.id, await handleRequest(request));
    } catch (error) {
      writeError(request.id, -32603, safeMessage(error));
    }
  });
}

async function handleRequest(request) {
  if (request.method === "initialize") {
    return {
      protocolVersion: request.params && request.params.protocolVersion || "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "ai-safety-guard", version: "2.0.0" },
      instructions: "Call evaluate_prompt before submitting user text to an AI. Do not submit prompts whose decision is block."
    };
  }
  if (request.method === "ping") return {};
  if (request.method === "tools/list") return { tools: [toolDefinition()] };
  if (request.method === "tools/call") return callTool(request.params);
  throw new Error(`Unsupported method: ${request.method}`);
}

function toolDefinition() {
  return {
    name: TOOL_NAME,
    title: "Evaluate AI prompt",
    description: "Evaluate an AI prompt with AI Safety Guard deterministic and nuanced heuristic policies. Prompt text is never returned.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", minLength: 1, maxLength: evaluator.MAX_TEXT_LENGTH, description: "Prompt proposed for AI submission." } },
      required: ["text"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  };
}

function callTool(params) {
  if (!params || params.name !== TOOL_NAME) throw new Error("Unknown tool");
  const text = params.arguments && params.arguments.text;
  if (typeof text !== "string") throw new Error("text must be a string");
  const result = evaluator.evaluatePrompt(text, loadConfig());
  const compact = compactResult(result);
  return { content: [{ type: "text", text: JSON.stringify(compact) }], structuredContent: compact };
}

async function runHook() {
  const raw = await readAllStdin();
  if (!raw.trim()) return;
  let payload;
  try { payload = JSON.parse(raw); } catch { payload = raw; }
  const prompt = extractPrompt(payload);
  if (!prompt) return;
  const config = loadConfig();
  const result = evaluator.evaluatePrompt(prompt, config);
  if (!result.blocked) return;
  const reason = formatBlockReason(prompt, result, config);
  if (payload && payload.hook_event_name === "UserPromptSubmit") {
    process.stdout.write(`${JSON.stringify({
      decision: "block",
      reason,
      hookSpecificOutput: { hookEventName: "UserPromptSubmit", suppressOriginalPrompt: true }
    })}\n`);
    return;
  }
  process.stderr.write(`${reason}\n`);
  process.exitCode = 2;
}

function loadConfig() {
  const configuredPath = process.env.AI_SAFETY_CONFIG || path.join(__dirname, "config.json");
  let stored = {};
  if (fs.existsSync(configuredPath)) {
    const stat = fs.statSync(configuredPath);
    if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) throw new Error("Invalid AI Safety configuration file");
    stored = JSON.parse(fs.readFileSync(configuredPath, "utf8"));
  }
  return {
    mode: process.env.AI_SAFETY_MODE || stored.mode || "heuristic",
    enabledCategories: Array.isArray(stored.enabledCategories) ? stored.enabledCategories : undefined,
    obfuscateSensitiveData: stored.obfuscateSensitiveData === true,
    policies: Array.isArray(stored.policies) ? stored.policies : undefined
  };
}

function formatBlockReason(prompt, result, config) {
  const categoryLabels = result.categories.map((category) => detector.CATEGORIES[category] || category);
  const findingLabels = [...new Set(result.findings.map((finding) => finding.label).filter(Boolean))];
  const lines = [
    "🛡️ AI Safety Guard bloqueou o envio para proteger dados sensíveis.",
    `Confiança: ${Math.round(result.confidence)}%`,
    `Categorias: ${categoryLabels.join(", ") || "Risco não classificado"}`,
    `Detecções: ${findingLabels.join(", ") || "Política heurística"}`,
    "O prompt original não foi enviado ao modelo."
  ];
  if (result.policyIds.length) lines.splice(4, 0, `Políticas: ${result.policyIds.join(", ")}`);
  if (config.obfuscateSensitiveData === true) {
    const obfuscated = evaluator.obfuscatePrompt(prompt, result, config);
    if (obfuscated) lines.push("", "Versão ofuscada para revisar e reenviar:", sanitizePreview(obfuscated));
    else lines.push("", "A ofuscação automática não encontrou um trecho substituível. Revise o conteúdo antes de reenviar.");
  } else {
    lines.push("Ative a ofuscação no plugin e baixe novamente o config.json para receber uma versão com [REDACTED].");
  }
  return lines.join("\n");
}

function sanitizePreview(value) {
  const clean = String(value).replace(/\x1B(?:\[[0-?]*[ -\/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  return clean.length > 4_000 ? `${clean.slice(0, 4_000)}\n[… conteúdo ofuscado truncado …]` : clean;
}

function compactResult(result) {
  return {
    enabled: result.enabled,
    mode: result.mode,
    decision: result.decision,
    blocked: result.blocked,
    confidence: result.confidence,
    categories: result.categories,
    policyIds: result.policyIds,
    findings: result.findings.slice(0, 8).map(({ source, category, label, score, policyId }) => ({ source, category, label, score, ...(policyId ? { policyId } : {}) })),
    engines: result.engines
  };
}

function extractPrompt(input) {
  if (typeof input === "string") return input.trim();
  if (!input || typeof input !== "object") return "";
  for (const key of ["prompt", "user_prompt", "userPrompt", "message", "input"]) if (typeof input[key] === "string") return input[key].trim();
  if (Array.isArray(input.messages)) {
    const message = [...input.messages].reverse().find((item) => item && item.role === "user" && typeof item.content === "string");
    if (message) return message.content.trim();
  }
  return "";
}

function readAllStdin() {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    process.stdin.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_MESSAGE_BYTES) {
        reject(new Error("Hook input is too large"));
        process.stdin.destroy();
      } else chunks.push(chunk);
    });
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

function writeResult(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function writeError(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: id === undefined ? null : id, error: { code, message } })}\n`);
}

function safeMessage(error) {
  return String(error && error.message || "Internal error").replace(/[\r\n]+/g, " ").slice(0, 240);
}

function failHook(error) {
  process.stderr.write(`AI Safety Guard evaluation failed: ${safeMessage(error)}\n`);
  process.exitCode = 2;
}

}
};
const __cache = Object.create(null);
function __require(id) {
  if (!__modules[id]) return require(id);
  if (__cache[id]) return __cache[id].exports;
  const module = { exports: {} };
  __cache[id] = module;
  __modules[id](module, module.exports, __require);
  return module.exports;
}
__require("./standalone-entry.cjs");
