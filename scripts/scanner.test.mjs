import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import "../shared/scanner.js";

test("demo draft retains the ask and drops from 50 to 0", () => {
  const review = Redact.scan(Redact.sample);
  assert.equal(review.score, 50);
  assert.deepEqual(review.reasons.map(({ kind, points }) => [kind, points]), [["phone", 25], ["student", 25]]);
  assert.match(review.rewritten, /^Draft a short email asking my professor for a one-day extension on my lab report\./);
  assert.match(review.rewritten, /\[phone number\].+\[student ID\]/);
  assert.equal(Redact.scan(review.rewritten).score, 0);
});

test("weights count once per category and cap at 100", () => {
  const review = Redact.scan("Email a@example.com or b@example.com. Use SSN 000-12-3456 and card 4111 1111 1111 1111.");
  assert.equal(review.score, 100);
  assert.deepEqual(review.reasons.map(({ kind, count }) => [kind, count]), [["government", 1], ["card", 1], ["email", 2]]);
  assert.equal(Redact.scan("Ignore 1111 1111 1111 1111 and ticket 123456789012345.").score, 0);
});

test("contextual findings must point to an exact span outside placeholders", () => {
  const review = Redact.scan("Draft a message from Avery Example to [name] at 21 Demo Lane.", [
    { kind: "name", text: "Avery Example" },
    { kind: "address", text: "21 Demo Lane" },
    { kind: "name", text: "name" },
    { kind: "name", text: "Avery Ex" },
    { kind: "secret", text: "invented value" },
    { kind: "constructor", text: "Draft" },
  ]);
  assert.equal(review.score, 45);
  assert.equal(review.rewritten, "Draft a message from [name 2] to [name] at [address].");
});

test("history requires consent, stores summaries only, and serves them to the configured site", async () => {
  const context = { Redact, URL, RedactConfig: { allowedOrigins: ["http://127.0.0.1:4173"] }, importScripts() {} };
  let inner;
  let external;
  const data = {};
  const id = "redact-test-id";
  const panelUrl = "chrome-extension://" + id + "/popup.html";
  context.chrome = {
    runtime: {
      id,
      getURL: () => panelUrl,
      onMessage: { addListener(listener) { inner = listener; } },
      onMessageExternal: { addListener(listener) { external = listener; } },
    },
    storage: {
      local: {
        async get() { return structuredClone(data); },
        async set(values) { Object.assign(data, structuredClone(values)); },
      },
    },
  };
  vm.runInNewContext(await readFile(new URL("../extension/background.js", import.meta.url), "utf8"), context);
  const send = (listener, message, sender) => new Promise(resolve => {
    if (listener(message, sender, resolve) !== true) resolve(undefined);
  });
  const chat = { id, url: "https://chatgpt.com/", frameId: 0 };
  const panel = { id, url: panelUrl };
  const site = { url: "http://127.0.0.1:4173/" };
  assert.equal((await send(inner, { type: "REDACT_PREFERENCES" }, chat)).mode, "auto");
  data.autoRedact = false;
  assert.equal((await send(inner, { type: "REDACT_PREFERENCES" }, chat)).mode, "manual");
  assert.equal(await send(inner, { type: "REDACT_SET_MODE", mode: "off" }, chat), undefined);
  assert.equal(await send(external, { type: "REDACT_SET_MODE", mode: "off" }, site), undefined);
  assert.equal((await send(inner, { type: "REDACT_SET_MODE", mode: "off" }, panel)).mode, "off");
  assert.equal((await send(inner, { type: "REDACT_PREFERENCES" }, chat)).mode, "off");
  const log = { type: "REDACT_LOG", kinds: ["phone", "phone", "unknown", "student"], text: Redact.sample };
  assert.equal((await send(inner, log, chat)).saved, false);
  assert.equal(await send(inner, { type: "REDACT_SET_HISTORY", enabled: true }, chat), undefined);
  assert.equal((await send(inner, { type: "REDACT_SET_HISTORY", enabled: true }, panel)).enabled, true);
  assert.equal((await send(inner, log, chat)).saved, false);
  assert.equal((await send(inner, { type: "REDACT_SET_MODE", mode: "manual" }, panel)).mode, "manual");
  assert.equal(await send(inner, log, { ...chat, frameId: 1 }), undefined);
  const writes = await Promise.all([send(inner, log, chat), send(inner, { ...log, kinds: [] }, chat)]);
  assert.ok(writes.every(write => write.saved));
  assert.equal(await send(external, { type: "REDACT_HISTORY" }, { url: "http://127.0.0.1:8888/" }), undefined);
  assert.equal(await send(external, { type: "REDACT_CLEAR_HISTORY" }, site), undefined);
  const { summaries } = await send(external, { type: "REDACT_HISTORY" }, site);
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0].score, 0);
  assert.equal(summaries[1].score, 50);
  assert.deepEqual(summaries[1].kinds, ["phone", "student"]);
  assert.deepEqual(Object.keys(summaries[1]).sort(), ["kinds", "provider", "score", "timestamp"]);
  assert.equal((await send(inner, { type: "REDACT_CLEAR_HISTORY" }, panel)).cleared, true);
  assert.equal((await send(external, { type: "REDACT_HISTORY" }, site)).summaries.length, 0);
});
