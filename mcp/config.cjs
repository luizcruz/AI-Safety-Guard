"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MAX_CONFIG_BYTES = 256_000;

function loadConfig(environment = process.env) {
  const localPath = path.join(__dirname, "config.json");
  const configuredPath = environment.AI_SAFETY_CONFIG || (fs.existsSync(localPath) ? localPath : "");
  let stored = {};
  if (configuredPath) {
    const absolutePath = path.resolve(configuredPath);
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) throw new Error("Invalid AI Safety configuration file");
    stored = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  }
  return {
    mode: environment.AI_SAFETY_MODE || stored.mode || "heuristic",
    enabledCategories: Array.isArray(stored.enabledCategories) ? stored.enabledCategories : undefined,
    policies: Array.isArray(stored.policies) ? stored.policies : undefined
  };
}

module.exports = Object.freeze({ loadConfig, MAX_CONFIG_BYTES });
