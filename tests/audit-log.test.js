"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { FILE_NAME, MIME_TYPE, serialize, download } = require("../src/audit-log.js");

test("serializa a auditoria em JSON Lines", () => {
  const entries = [{ timestamp: "2026-08-16T12:00:00.000Z", ai: "ChatGPT", findings: [] }, { ai: "Gemini", findings: [{ label: "CPF" }] }];
  const lines = serialize(entries).trimEnd().split("\n");
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map(JSON.parse), entries);
  assert.equal(serialize([]), "");
  assert.equal(serialize(null), "");
});

test("baixa manualmente o log e libera a URL temporária", () => {
  const calls = [];
  const link = { click: () => calls.push("click"), remove: () => calls.push("remove") };
  const environment = {
    Blob: class FakeBlob { constructor(parts, options) { this.parts = parts; this.type = options.type; calls.push(this); } },
    URL: {
      createObjectURL: (blob) => { calls.push(["create", blob]); return "blob:audit"; },
      revokeObjectURL: (url) => calls.push(["revoke", url])
    },
    document: {
      createElement: (tag) => { assert.equal(tag, "a"); return link; },
      body: { appendChild: (element) => { assert.equal(element, link); calls.push("append"); } }
    },
    setTimeout: (callback, delay) => { assert.equal(delay, 0); callback(); }
  };

  assert.equal(download([{ ai: "Claude", findings: [] }], environment), true);
  assert.equal(link.download, FILE_NAME);
  assert.equal(link.href, "blob:audit");
  assert.equal(calls[0].type, MIME_TYPE);
  assert.deepEqual(calls.slice(2), ["append", "click", "remove", ["revoke", "blob:audit"]]);
});

test("não inicia download quando o histórico está vazio", () => {
  assert.equal(download([], { Blob: () => assert.fail("não deve criar Blob") }), false);
});
