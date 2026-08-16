(function exposeRuleCatalog(root, factory) {
  const catalog = factory();
  if (typeof module === "object" && module.exports) module.exports = catalog;
  root.AIChatDLPRules = catalog;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRuleCatalog() {
  "use strict";

  return Object.freeze({
    version: "1.1.0",
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
      telemetryLogs: "PII em telemetria e logs de aplicação"
    }),
    patterns: Object.freeze([
      p("personal", "CPF", "\\b\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}\\b", "g", 90),
      p("personal", "RG", "\\b\\d{2}\\.\\d{3}\\.\\d{3}-[\\dXx]\\b", "g", 85),
      p("personal", "Passaporte", "\\b[A-Z]{2}\\d{6}\\b", "g", 85),
      p("personal", "CNH", "\\b(?:CNH|Carteira Nacional de Habilita(?:ç|c)ão)\\s*[:#-]?\\s*\\d{11}\\b", "gi", 85),
      p("personal", "PIS/PASEP", "\\b(?:PIS|PASEP)\\s*[:#-]?\\s*\\d{3}[. ]?\\d{5}[. ]?\\d{2}[- ]?\\d\\b", "gi", 85),
      p("medical", "Registro profissional", "\\b(?:CRM|CRO|COREN)\\s*\\/?\\s*[A-Z]{2}\\s*[-:]?\\s*\\d{3,10}\\b", "gi", 75),
      p("medical", "Código CID", "\\bCID(?:-?10|-?11)?\\s*[:#-]?\\s*[A-Z]\\d{2}(?:\\.\\d{1,2})?\\b", "gi", 75),
      p("medical", "Posologia", "\\b\\d+(?:[.,]\\d+)?\\s*(?:mg|ml|mcg|gotas?)\\b", "gi", 55),
      p("financial", "Linha digitável de boleto", "\\b\\d{5}\\.\\d{5}\\s+\\d{5}\\.\\d{6}\\s+\\d{5}\\.\\d{6}\\s+\\d\\s+\\d{14}\\b", "g", 95),
      p("financial", "Chave PIX UUID", "\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b", "gi", 85),
      p("financial", "Valor monetário", "R\\$\\s?\\d{1,3}(?:\\.\\d{3})*(?:,\\d{2})?|R\\$\\s?\\d+(?:[.,]\\d{2})?", "gi", 25),
      p("corporate", "CNPJ", "\\b\\d{2}\\.\\d{3}\\.\\d{3}\\/\\d{4}-\\d{2}\\b", "g", 85),
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
});
