import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { createLocalAi, createLoopbackTransport } from "../desktop/local-ai.mjs";

function fixture(overrides = {}) {
  const calls = [];
  const replies = {
    "/api/status": { cloud: { disabled: true } },
    "/api/tags": { models: [{ name: "qwen3:4b", size: 2500000000, details: { format: "gguf" } }] },
    "/api/show": { capabilities: ["completion"], details: { format: "gguf" } },
    "/api/chat": { done: true, done_reason: "stop", message: { content: JSON.stringify({ findings: [{ kind: "name", text: "Morgan Example" }] }) } },
    ...overrides,
  };
  const requestJson = async (path, body, signal) => {
    calls.push({ path, body });
    if (typeof replies[path] === "function") return replies[path](body, signal);
    return structuredClone(replies[path]);
  };
  return { ai: createLocalAi({ requestJson }), calls };
}

test("desktop AI is off by default and receives no text before opt-in", async () => {
  const { ai, calls } = fixture();
  assert.equal((await ai.analyze("My name is Morgan Example")).ok, false);
  assert.equal(calls.length, 0);
  assert.equal((await ai.getStatus()).state, "disabled");
  assert.ok(calls.every(call => !JSON.stringify(call).includes("Morgan")));
});

test("desktop AI verifies cloud-disabled state and local artifacts before sending text", async () => {
  const { ai, calls } = fixture();
  assert.equal((await ai.setEnabled(true)).state, "available");
  const reply = await ai.analyze("My name is Morgan Example");
  assert.equal(reply.ok, true);
  assert.equal(reply.findings[0].text, "Morgan Example");
  assert.deepEqual(calls.slice(-4).map(call => call.path), ["/api/status", "/api/tags", "/api/show", "/api/chat"]);
  const chat = calls.at(-1).body;
  assert.equal(chat.stream, false);
  assert.equal(chat.truncate, false);
  assert.equal(chat.tools, undefined);
  assert.equal(chat.model, "qwen3:4b");
});

for (const [label, overrides] of [
  ["cloud enabled", { "/api/status": { cloud: { disabled: false } } }],
  ["unknown cloud state", { "/api/status": {} }],
  ["missing local model", { "/api/tags": { models: [] } }],
  ["remote model alias", { "/api/show": { remote_model: "cloud-model", remote_host: "https://ollama.com", details: { format: "gguf" } } }],
  ["unsupported model", { "/api/show": { capabilities: ["embedding"], details: { format: "gguf" } } }],
]) test(`desktop refuses text transmission: ${label}`, async () => {
  const { ai, calls } = fixture(overrides);
  assert.notEqual((await ai.setEnabled(true)).state, "available");
  assert.equal((await ai.analyze("private data")).ok, false);
  assert.ok(calls.every(call => call.path !== "/api/chat"));
});

test("desktop output failure never becomes a successful empty scan", async () => {
  for (const reply of [{ done: false }, { done: true, done_reason: "length" },
    { done: true, message: { content: '{"findings":' } },
    { done: true, message: { content: '{"findings":[{"kind":"arbitrary","text":"abc"}]}' } }]) {
    const { ai } = fixture({ "/api/chat": reply });
    await ai.setEnabled(true);
    assert.equal((await ai.analyze("private data")).ok, false);
  }
});

test("disabling desktop AI aborts in-flight analysis and revokes further requests", async () => {
  let started;
  const running = new Promise(resolve => { started = resolve; });
  const { ai, calls } = fixture({ "/api/chat": (_body, signal) => new Promise((_resolve, reject) => {
    started();
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }) });
  await ai.setEnabled(true);
  const pending = ai.analyze("private data");
  await running;
  await ai.setEnabled(false);
  assert.equal((await pending).ok, false);
  const count = calls.length;
  assert.equal((await ai.analyze("another draft")).ok, false);
  assert.equal(calls.length, count);
});

test("a slow enable cannot undo a later disable", async () => {
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const { ai } = fixture({ "/api/status": async () => { await gate; return { cloud: { disabled: true } }; } });
  const pending = ai.setEnabled(true);
  await ai.setEnabled(false);
  finish();
  assert.equal((await pending).state, "disabled");
  assert.equal((await ai.analyze("private data")).ok, false);
});

test("desktop rejects malformed and oversized analysis arguments", async () => {
  const { ai, calls } = fixture();
  for (const value of [null, {}, "", " ", "x".repeat(6001)]) await assert.rejects(ai.analyze(value));
  await assert.rejects(ai.setEnabled("yes"));
  assert.equal(calls.length, 0);
});

test("loopback transport rejects redirects, oversized bodies, invalid JSON and timeouts", async () => {
  let mode = "redirect";
  const server = createServer((_req, response) => {
    if (mode === "redirect") { response.writeHead(302, { Location: "https://example.com/" }); response.end(); }
    if (mode === "large") response.end("x".repeat(600000));
    if (mode === "invalid") response.end("invalid JSON");
    if (mode === "valid") response.end('{"cloud":{"disabled":true}}');
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const localRequest = createLoopbackTransport(server.address().port);
  try {
    for (const item of ["redirect", "large", "invalid", "timeout"]) {
      mode = item;
      await assert.rejects(localRequest("/api/status", undefined, undefined, 100));
    }
    mode = "valid";
    assert.equal((await localRequest("/api/status")).cloud.disabled, true);
    assert.throws(() => localRequest("https://evil.test"));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
