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
  assert.match(fs.readFileSync(path.join(root, ".gitignore"), "utf8"), /^api\/\.env$/m);
});

test("Docker Compose mantém API local, persistência e health check", () => {
  assert.match(compose, /127\.0\.0\.1:8000:8000/);
  assert.match(compose, /rules-data:\/data\/rulesets/);
  assert.match(compose, /http:\/\/127\.0\.0\.1:8000\/health/);
});
