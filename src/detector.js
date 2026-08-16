(function exposeDetector(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AIChatDLP = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createDetector() {
  "use strict";

  const CATEGORIES = Object.freeze({
    personal: "Documentos pessoais",
    medical: "Documentos médicos",
    financial: "Documentos financeiros",
    corporate: "Documentos corporativos",
    credentials: "Credenciais e chaves de acesso"
  });

  const RULES = [
    rule("personal", "CPF", /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, 90),
    rule("personal", "RG", /\b\d{2}\.\d{3}\.\d{3}-[\dXx]\b/g, 85),
    rule("personal", "Passaporte", /\b[A-Z]{2}\d{6}\b/g, 85),
    rule("personal", "CNH", /\b(?:CNH|Carteira Nacional de Habilita(?:ç|c)ão)\s*[:#-]?\s*\d{11}\b/gi, 85),
    rule("personal", "PIS/PASEP", /\b(?:PIS|PASEP)\s*[:#-]?\s*\d{3}[. ]?\d{5}[. ]?\d{2}[- ]?\d\b/gi, 85),

    rule("medical", "Registro profissional", /\b(?:CRM|CRO|COREN)\s*\/?\s*[A-Z]{2}\s*[-:]?\s*\d{3,10}\b/gi, 75),
    rule("medical", "Código CID", /\bCID(?:-?10|-?11)?\s*[:#-]?\s*[A-Z]\d{2}(?:\.\d{1,2})?\b/gi, 75),
    rule("medical", "Posologia", /\b\d+(?:[.,]\d+)?\s*(?:mg|ml|mcg|gotas?)\b/gi, 55),

    rule("financial", "Linha digitável de boleto", /\b\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14}\b/g, 95),
    rule("financial", "Cartão de pagamento", /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, 90, isLuhnMatch),
    rule("financial", "Chave PIX UUID", /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, 85),
    rule("financial", "Valor monetário", /R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?|R\$\s?\d+(?:[.,]\d{2})?/gi, 25),

    rule("corporate", "CNPJ", /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, 85),
    rule("corporate", "Inscrição Estadual", /\b(?:I\.?E\.?|Inscri(?:ç|c)ão Estadual)\s*[:#-]?\s*[\d.\/-]{6,18}\b/gi, 70),
    rule("corporate", "Número de processo/contrato", /\b(?:processo|contrato)\s*(?:n[º°o.]*)?\s*[:#-]?\s*[\d./-]{6,25}\b/gi, 55),

    rule("credentials", "Chave de acesso AWS", /\bAKIA[0-9A-Z]{16}\b/g, 100),
    rule("credentials", "Token JWT", /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, 100),
    rule("credentials", "Chave privada", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, 100),
    rule("credentials", "Senha declarada", /["']?(?:password|passwd|pwd|db_pass)["']?\s*[:=]\s*["'][^"'\r\n]{4,}["']/gi, 100),
    rule("credentials", "Hash MD5/SHA-256", /\b(?:[a-f\d]{32}|[a-f\d]{64})\b/gi, 55)
  ];

  const KEYWORDS = {
    personal: ["data de nascimento", "filiação", "filiacao", "nome da mãe", "nome da mae", "certidão de nascimento", "certidao de nascimento", "certidão de casamento", "certidao de casamento", "título de eleitor", "titulo de eleitor", "órgão emissor", "orgao emissor"],
    medical: ["receita médica", "receita medica", "atestado", "prontuário", "prontuario", "posologia", "diagnóstico", "diagnostico", "laudo acompanhante", "uso contínuo", "uso continuo", "solicitação de exames", "solicitacao de exames"],
    financial: ["comprovante de transferência", "comprovante de transferencia", "extrato bancário", "extrato bancario", "informe de rendimentos", "irpf", "fatura", "autenticação bancária", "autenticacao bancaria", "agência/conta", "agencia/conta"],
    corporate: ["razão social", "razao social", "nome fantasia", "contrato social", "acordo de confidencialidade", "nda", "procuração", "procuracao", "ata de assembleia", "cláusula", "clausula", "foro de eleição", "foro de eleicao"],
    credentials: ["secret_key", "api_key", "access_token", "bearer_token", "connection_string", "private_key", "db_pass"]
  };

  function rule(category, label, regex, score, validate) {
    return { category, label, regex, score, validate };
  }

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

  function redact(value) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length <= 8) return "••••";
    return `${normalized.slice(0, 3)}••••${normalized.slice(-3)}`;
  }

  function addFinding(findings, finding) {
    if (!findings.some((item) => item.category === finding.category && item.label === finding.label && item.sample === finding.sample)) {
      findings.push(finding);
    }
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

  function detectStructures(text, findings) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const labelValueLines = lines.filter((line) => /^[\p{L}][\p{L}\s/.-]{2,30}:\s*\S+/u.test(line)).length;
    const publicHeader = /secretaria (?:de|da)|república federativa|ministerio|ministério|órgão emissor/i.test(text);
    const issueDate = /data (?:de )?expedição|expedido em|emissão\s*:/i.test(text);
    if (labelValueLines >= 3 && (publicHeader || issueDate)) {
      addFinding(findings, { category: "personal", label: "Estrutura de documento oficial", score: 65, sample: "rótulos e cabeçalho oficial" });
    }

    const professionalHeader = /(?:dr\.?|dra\.?)\s+.+|(?:clínica|clinica|hospital)\s+/i.test(lines.slice(0, 4).join(" "));
    const patientBody = /paciente\s*:|nome do paciente|dados do paciente/i.test(text);
    const clinicalBody = /medicamento|diagnóstico|diagnostico|quadro clínico|quadro clinico/i.test(text);
    const signedFooter = /assinatura|carimbo/i.test(lines.slice(-5).join(" "));
    if ([professionalHeader, patientBody, clinicalBody, signedFooter].filter(Boolean).length >= 3) {
      addFinding(findings, { category: "medical", label: "Estrutura de documento clínico", score: 70, sample: "profissional, paciente e conteúdo clínico" });
    }

    const financeColumns = ["data", "histórico", "historico", "débito", "debito", "crédito", "credito", "saldo"].filter((word) => text.toLowerCase().includes(word)).length;
    if (financeColumns >= 4 && /banco|instituição financeira|instituicao financeira|agência|agencia/i.test(text)) {
      addFinding(findings, { category: "financial", label: "Estrutura de extrato financeiro", score: 70, sample: "tabela de movimentações bancárias" });
    }

    const clauses = (text.match(/(?:cláusula|clausula)\s+(?:\d+|[ivxlcdm]+)/gi) || []).length;
    const parties = /(?:contratante|contratada|outorgante|outorgado|doravante denominada)/i.test(text);
    const witnesses = /testemunhas?|assinaturas?/i.test(lines.slice(-8).join(" "));
    if (clauses >= 2 && parties && witnesses) {
      addFinding(findings, { category: "corporate", label: "Estrutura de contrato corporativo", score: 75, sample: "partes, cláusulas e assinaturas" });
    }

    const configAssignments = (text.match(/^[A-Z][A-Z0-9_]{2,}\s*[:=]\s*\S+/gm) || []).length;
    const encodedSecrets = (text.match(/\b(?:[A-Fa-f0-9]{40,}|[A-Za-z0-9+/]{48,}={0,2})\b/g) || []).length;
    if (configAssignments >= 2 && encodedSecrets >= 1) {
      addFinding(findings, { category: "credentials", label: "Configuração com segredo codificado", score: 90, sample: "variáveis e cadeia codificada" });
    }
  }

  function analyze(text, options) {
    const input = String(text || "");
    const enabledCategories = new Set((options && options.enabledCategories) || Object.keys(CATEGORIES));
    const findings = [];

    for (const item of RULES) {
      if (!enabledCategories.has(item.category)) continue;
      item.regex.lastIndex = 0;
      for (const match of input.matchAll(item.regex)) {
        if (!item.validate || item.validate(match[0])) {
          addFinding(findings, { category: item.category, label: item.label, score: item.score, sample: redact(match[0]) });
        }
      }
    }

    detectPixContext(input, findings);
    detectStructures(input, findings);

    const lower = input.toLocaleLowerCase("pt-BR");
    for (const [category, words] of Object.entries(KEYWORDS)) {
      if (!enabledCategories.has(category)) continue;
      const matched = words.filter((word) => lower.includes(word));
      if (matched.length) {
        addFinding(findings, { category, label: "Termos sensíveis", score: Math.min(40 + matched.length * 10, 70), sample: matched.slice(0, 3).join(", ") });
      }
    }

    const activeFindings = findings.filter((finding) => enabledCategories.has(finding.category));
    const categoryScores = {};
    for (const finding of activeFindings) categoryScores[finding.category] = (categoryScores[finding.category] || 0) + finding.score;
    const blocked = activeFindings.some((finding) => finding.score >= 70) || Object.values(categoryScores).some((score) => score >= 50);

    return {
      blocked,
      findings: activeFindings,
      categories: [...new Set(activeFindings.map((finding) => finding.category))],
      categoryScores
    };
  }

  return Object.freeze({ analyze, CATEGORIES, _internal: Object.freeze({ isLuhnMatch, redact }) });
});
