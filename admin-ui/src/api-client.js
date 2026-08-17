"use strict";

class RulesApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "RulesApiError";
    this.status = status;
  }
}

class RulesApiClient {
  constructor({ baseUrl, token, fetchImpl = fetch, timeoutMs = 8000 }) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async request(path, { method = "GET", body, ifMatch } = {}) {
    const headers = { Accept: "application/json", Authorization: `Bearer ${this.token}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (ifMatch) headers["If-Match"] = ifMatch;
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      throw new RulesApiError(502, error.name === "TimeoutError" ? "Tempo limite ao acessar a API de regras" : "API de regras indisponível");
    }
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = { detail: "Resposta inválida da API de regras" }; }
    }
    if (!response.ok) throw new RulesApiError(response.status, data && data.detail ? String(data.detail) : `API respondeu ${response.status}`);
    return { data, etag: response.headers.get("etag") };
  }
}

module.exports = { RulesApiClient, RulesApiError };
