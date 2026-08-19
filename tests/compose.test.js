"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const compose = fs.readFileSync(path.join(root, "docker-compose.yml"), "utf8");

test("Docker Compose carrega o arquivo de ambiente privado da API", () => {
  assert.match(compose, /env_file:\s*\n\s*- \.\/api\/\.env/);
  assert.doesNotMatch(compose, /\$\{AI_SAFETY_API_TOKEN/);
  const environmentExample = fs.readFileSync(path.join(root, "api", ".env.example"), "utf8");
  assert.match(environmentExample, /^AI_SAFETY_ADMIN_KEY=$/m);
  assert.match(fs.readFileSync(path.join(root, ".gitignore"), "utf8"), /^api\/\.env$/m);
});

test("Docker Compose mantém API local, persistência e health check", () => {
  assert.match(compose, /127\.0\.0\.1:8000:8000/);
  assert.match(compose, /rules-data:\/data\/rulesets/);
  assert.match(compose, /http:\/\/127\.0\.0\.1:8000\/health/);
});

test("Docker Compose integra painel Node.js sem publicar token no navegador", () => {
  assert.match(compose, /rules-admin:/);
  assert.match(compose, /RULES_API_URL: http:\/\/rules-api:8000/);
  assert.match(compose, /127\.0\.0\.1:3000:3000/);
  assert.match(compose, /condition: service_healthy/);
});
