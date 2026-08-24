"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "bin", "deploy"), "utf8");

test("launcher raiz atualiza somente por fast-forward antes do Docker", () => {
  assert.match(source, /^#!\/usr\/bin\/env bash/);
  assert.doesNotMatch(source, /\r/);
  assert.match(source, /git fetch --prune/);
  assert.match(source, /git merge --ff-only/);
  assert.match(source, /git rev-list --left-right --count/);
  assert.match(source, /git status --porcelain/);
  assert.ok(source.indexOf("git fetch --prune") < source.indexOf("docker compose up --build -d"));
  assert.doesNotMatch(source, /reset --hard|checkout -f|clean -f/);
});

test("launcher valida Compose e oferece controles operacionais", () => {
  assert.match(source, /docker compose config --quiet/);
  assert.match(source, /docker compose version/);
  assert.match(source, /api\/\.env/);
  assert.match(source, /AI_SAFETY_API_TOKEN/);
  assert.match(source, /AI_SAFETY_ADMIN_KEY/);
  assert.match(source, /\$'\\r'/);
  assert.match(source, /--check-only/);
  assert.match(source, /--no-update/);
  assert.match(source, /flock -n/);
  assert.equal(fs.existsSync(path.join(root, "api", "bin", "deploy")), false);
});
