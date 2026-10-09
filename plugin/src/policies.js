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
