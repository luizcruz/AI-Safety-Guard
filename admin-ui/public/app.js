(function rulesAdmin() {
  "use strict";

  const state = { meta: null, rules: [] };
  const byId = (id) => document.getElementById(id);
  const elements = {
    version: byId("catalog-version"), ruleCount: byId("rule-count"), categoryCount: byId("category-count"), typeCount: byId("type-count"),
    status: byId("status"), table: byId("rules"), empty: byId("empty"), filterKind: byId("filter-kind"), filterCategory: byId("filter-category"),
    dialog: byId("rule-dialog"), form: byId("rule-form"), title: byId("dialog-title"), formError: byId("form-error"), save: byId("save"),
    id: byId("rule-id"), kind: byId("kind"), category: byId("category"), label: byId("label"), score: byId("score"), source: byId("source"),
    flags: byId("flags"), validator: byId("validator"), keyword: byId("keyword"), heuristicId: byId("heuristic-id"), fileNames: byId("file-names")
  };

  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers } });
    const data = response.status === 204 ? null : await response.json().catch(() => ({ detail: "Resposta inválida do painel" }));
    if (!response.ok) throw new Error(data && data.detail ? data.detail : `Falha HTTP ${response.status}`);
    return data;
  }

  function addOptions(select, values, keepFirst = false) {
    const first = keepFirst ? select.firstElementChild : null;
    select.replaceChildren(...(first ? [first] : []));
    for (const value of values) {
      const option = document.createElement("option");
      option.value = value.value;
      option.textContent = value.label;
      select.appendChild(option);
    }
  }

  async function load(message = "Regras atualizadas.") {
    setStatus("Carregando regras…");
    try {
      const [meta, rules] = await Promise.all([request("/admin/meta"), request("/admin/rules")]);
      state.meta = meta;
      state.rules = rules;
      populateSelectors();
      render();
      setStatus(message, "success");
    } catch (error) {
      setStatus(error.message, "failure");
    }
  }

  function populateSelectors() {
    const types = state.meta.types;
    const categories = Object.entries(state.meta.categories).map(([value, label]) => ({ value, label }));
    addOptions(elements.kind, types);
    addOptions(elements.category, categories);
    addOptions(elements.filterKind, types, true);
    addOptions(elements.filterCategory, categories, true);
    addOptions(elements.validator, state.meta.validators);
    addOptions(elements.heuristicId, state.meta.heuristics.map((value) => ({ value, label: value })));
    elements.version.textContent = `v${state.meta.version}`;
    elements.ruleCount.textContent = String(state.rules.length);
    elements.categoryCount.textContent = String(categories.length);
    elements.typeCount.textContent = String(types.length);
  }

  function render() {
    const kind = elements.filterKind.value;
    const category = elements.filterCategory.value;
    const rules = state.rules.filter((rule) => (!kind || rule.kind === kind) && (!category || rule.category === category));
    elements.table.replaceChildren(...rules.map(createRow));
    elements.empty.hidden = rules.length !== 0;
  }

  function createRow(rule) {
    const row = document.createElement("tr");
    const type = state.meta.types.find((item) => item.value === rule.kind)?.label || rule.kind;
    const category = state.meta.categories[rule.category] || rule.category;
    const primary = rule.label || rule.keyword || rule.heuristic_id || "Regra";
    const detail = rule.kind === "pattern" ? rule.source : rule.kind === "filename" ? rule.file_names.join(", ") : rule.kind === "heuristic" ? rule.heuristic_id : rule.keyword;
    appendCell(row, type, "badge");
    appendCell(row, category);
    const description = row.insertCell();
    const main = document.createElement("span"); main.className = "rule-main"; main.textContent = primary;
    const sub = document.createElement("span"); sub.className = "rule-detail"; sub.textContent = detail || "";
    description.append(main, sub);
    appendCell(row, rule.score ?? "—");
    const actions = row.insertCell(); actions.className = "actions";
    const group = document.createElement("div"); group.className = "row-actions";
    const edit = button("Editar", "secondary", () => openDialog(rule));
    const remove = button("Remover", "danger", () => removeRule(rule));
    group.append(edit, remove); actions.appendChild(group);
    return row;
  }

  function appendCell(row, value, className) {
    const cell = row.insertCell();
    if (className) { const span = document.createElement("span"); span.className = className; span.textContent = value; cell.appendChild(span); }
    else cell.textContent = value;
  }

  function button(label, className, action) {
    const value = document.createElement("button"); value.type = "button"; value.textContent = label; value.className = className; value.addEventListener("click", action); return value;
  }

  function openDialog(rule = null) {
    elements.form.reset();
    elements.id.value = rule?.id || "";
    elements.title.textContent = rule ? "Editar regra" : "Adicionar regra";
    elements.kind.value = rule?.kind || state.meta.types[0].value;
    elements.category.value = rule?.category || Object.keys(state.meta.categories)[0];
    elements.label.value = rule?.label || "";
    elements.score.value = rule?.score ?? 80;
    elements.source.value = rule?.source || "";
    elements.flags.value = rule?.flags || "g";
    elements.validator.value = rule?.validator || "";
    elements.keyword.value = rule?.keyword || "";
    elements.heuristicId.value = rule?.heuristic_id || state.meta.heuristics[0];
    elements.fileNames.value = rule?.file_names?.join("\n") || "";
    elements.formError.hidden = true;
    updateFields();
    elements.dialog.showModal();
  }

  function updateFields() {
    const kind = elements.kind.value;
    for (const field of document.querySelectorAll(".kind-field")) {
      field.hidden = field.classList.contains("non-keyword") ? kind === "keyword" : !field.classList.contains(`kind-${kind}`);
    }
    elements.label.required = kind !== "keyword";
    elements.score.required = kind !== "keyword";
    elements.source.required = kind === "pattern";
    elements.keyword.required = kind === "keyword";
    elements.heuristicId.required = kind === "heuristic";
    elements.fileNames.required = kind === "filename";
  }

  function payload() {
    const kind = elements.kind.value;
    const value = { kind, category: elements.category.value };
    if (kind === "keyword") value.keyword = elements.keyword.value.trim();
    else {
      value.label = elements.label.value.trim();
      value.score = Number(elements.score.value);
    }
    if (kind === "pattern") Object.assign(value, { source: elements.source.value, flags: elements.flags.value.trim() || "g", validator: elements.validator.value || null });
    if (kind === "heuristic") value.heuristic_id = elements.heuristicId.value;
    if (kind === "filename") value.file_names = [...new Set(elements.fileNames.value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
    return value;
  }

  async function saveRule(event) {
    event.preventDefault();
    elements.save.disabled = true;
    elements.formError.hidden = true;
    const id = elements.id.value;
    try {
      await request(id ? `/admin/rules/${encodeURIComponent(id)}` : "/admin/rules", {
        method: id ? "PUT" : "POST",
        headers: { "If-Match": `"${state.meta.version}"` },
        body: JSON.stringify(payload())
      });
      elements.dialog.close();
      await load(id ? "Regra atualizada." : "Regra adicionada.");
    } catch (error) {
      elements.formError.textContent = error.message;
      elements.formError.hidden = false;
    } finally { elements.save.disabled = false; }
  }

  async function removeRule(rule) {
    if (!confirm(`Remover a regra “${rule.label || rule.keyword || rule.heuristic_id}”?`)) return;
    try {
      await request(`/admin/rules/${encodeURIComponent(rule.id)}`, { method: "DELETE", headers: { "If-Match": `"${state.meta.version}"` } });
      await load("Regra removida.");
    } catch (error) { setStatus(error.message, "failure"); }
  }

  function setStatus(message, type = "") { elements.status.textContent = message; elements.status.className = `status ${type}`.trim(); }

  byId("add-rule").addEventListener("click", () => openDialog());
  byId("refresh").addEventListener("click", () => load());
  byId("close-dialog").addEventListener("click", () => elements.dialog.close());
  byId("cancel").addEventListener("click", () => elements.dialog.close());
  elements.kind.addEventListener("change", updateFields);
  elements.filterKind.addEventListener("change", render);
  elements.filterCategory.addEventListener("change", render);
  elements.form.addEventListener("submit", saveRule);
  load("Catálogo carregado.");
})();
