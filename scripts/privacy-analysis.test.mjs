import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import "../shared/scanner.js";
import "../shared/context.js";

const positives = [
  ["My name is Avery Example and I live at 21 Demo Lane.", ["name", "address"], 45],
  ["My full name is María José García. Please write a letter.", ["name"], 15],
  ["Name: Jean-Luc O’Neill\nTask: write an introduction.", ["name"], 15],
  ["My name is A. B. Example.", ["name"], 15],
  ["Send it to 123 West Main Street Apt 4B.", ["address"], 30],
  ["I have type 1 diabetes. Help me prepare questions for my doctor.", ["medical"], 25],
  ["My child has asthma and needs questions for their doctor.", ["medical"], 25],
  ["I was diagnosed with depression.", ["medical"], 25],
  ["My password is Sunshine-123!", ["secret"], 60],
  ['{"password": "example-real-secret-123"}', ["secret"], 60],
  ["api_key = 'abc98765secret'", ["secret"], 60],
  ["password = password", ["secret"], 60],
  ["password: changeme", ["secret"], 60],
  ["password: [actual-secret]", ["secret"], 60],
  ["Authorization: Bearer abcdefghijklmnopqrstuvwxyz.012345", ["secret"], 60],
  ["Reach me at avery@example.com or (202) 555-0147.", ["email", "phone"], 45],
  ["My student ID is PH-482716.", ["student"], 25],
];
for (const [text, kinds, score] of positives) test(`detects: ${text.slice(0, 65)}`, () => {
  const result = Redact.scan(text);
  assert.deepEqual([...new Set(result.matches.map(m => m.kind))].sort(), [...kinds].sort());
  assert.equal(result.score, score);
  for (const match of result.matches) assert.ok(text.slice(match.start, match.end).trim());
  assert.equal(Redact.scan(result.rewritten).score, 0);
});

for (const text of ["Explain diabetes and cancer for a biology class.", "I have no diabetes.",
  "Write a story about a student who studies medicine.", "What is a street address?", "My name is [name].",
  "password: [credential]", "password = <YOUR_PASSWORD>",
  "Compare 2026 and 2027 calendar dates.", "I am studying Computer Science.", "Explain Main Street economics."]) {
  test(`does not flag general topics/placeholders: ${text}`, () => assert.equal(Redact.scan(text).score, 0));
}

test("rewrites preserve punctuation, task constraints and repeated identities", () => {
  const text = "My name is Avery Example. Email a@example.com; cc b@example.com and a@example.com. Keep 200 words and 3 bullets.";
  const result = Redact.scan(text);
  assert.equal(result.rewritten, "My name is [name]. Email [email]; cc [email 2] and [email]. Keep 200 words and 3 bullets.");
});

test("keeping a health detail preserves usefulness and the remaining score", () => {
  const text = "I have type 1 diabetes. Email me at a@example.com. Write 3 questions for my doctor.";
  const result = Redact.scan(text);
  const health = result.matches.find(m => m.kind === "medical");
  const plan = Redact.rewrite(text, result, { [health.id]: "keep" });
  assert.equal(plan.score, 25);
  assert.equal(plan.text, "I have type 1 diabetes. Email me at [email]. Write 3 questions for my doctor.");
  assert.equal(plan.edits.find(e => e.kind === "medical").action, "keep");
});

test("retained contextual findings survive changed offsets in score comparisons", () => {
  const text = "Email a@example.com about Morgan Sample's appointment.";
  const result = Redact.scan(text, [{ kind: "name", text: "Morgan Sample" }]);
  const match = result.matches.find(m => m.kind === "name");
  const plan = Redact.rewrite(text, result, { [match.id]: "keep" });
  assert.equal(plan.score, 15);
  assert.equal(plan.matches.filter(m => m.kind === "name").length, 1);
  assert.equal(plan.text.slice(plan.matches[0].start, plan.matches[0].end), "Morgan Sample");
});

test("brackets around real personal information do not hide it from detection", () => {
  const result = Redact.scan("[avery@example.com] [María García]", [{ kind: "name", text: "María García" }]);
  assert.equal(result.score, 35);
  assert.equal(result.matches.length, 2);
});

test("contextual nominations cannot split Unicode words, invent spans, override secrets or score", () => {
  const text = "Name José García. password=abcdef1234";
  const result = Redact.scan(text, [{ kind: "name", text: "osé" },
    { kind: "name", text: "invented" }, { kind: "constructor", text: "Name" },
    { kind: "email", text: "abcdef1234", score: -100 }]);
  assert.deepEqual(result.reasons.map(r => r.kind), ["secret"]);
});

test("overlapping contextual findings do not double-count rule findings", () => {
  assert.equal(Redact.scan("21 Demo Lane", [{ kind: "name", text: "Demo Lane" }]).score, 30);
});

test("model output validation rejects invalid categories, shapes, oversized findings and truncation", () => {
  for (const raw of ['{"findings":', '{"findings":{}}', '{"findings":[{"kind":"constructor","text":"abc"}]}',
    JSON.stringify({ findings: [{ kind: "name", text: "x".repeat(301) }] }),
    JSON.stringify({ findings: Array.from({ length: 101 }, () => ({ kind: "name", text: "Bob Example" })) })]) {
    assert.throws(() => RedactContext.parse(raw));
  }
});

test("invalid or oversized inputs are not silently scored as safe", () => {
  for (const text of [null, {}, "x".repeat(20001)]) assert.throws(() => Redact.scan(text));
  assert.throws(() => Redact.rewrite("a@example.com", Redact.scan("a@example.com"), { 'email:0:13': 'delete' }));
});

test("maximum-sized structured inputs remain bounded and deterministic", () => {
  const text = " a@example.com".repeat(1400);
  const first = Redact.scan(text);
  assert.equal(first.score, 20);
  assert.equal(first.matches.length, 1400);
  assert.equal(first.rewritten, Redact.scan(text).rewritten);
});

test("browser model errors explicitly retain the rules result", async () => {
  const context = { Redact, RedactContext, AbortController, setTimeout, clearTimeout,
    LanguageModel: { availability: async () => "available", create: async () => ({
      prompt: async () => '{"findings":', destroy() {},
    }) } };
  vm.runInNewContext(await readFile(new URL("../shared/model.js", import.meta.url), "utf8"), context);
  const result = await context.RedactModel.check("a@example.com");
  assert.equal(result.score, 20);
  assert.equal(result.contextual, false);
  assert.match(result.coverage.reason, /failed|invalid/);
});

test("desktop model wrapper validates findings and labels coverage explicitly", async () => {
  const context = { Redact, RedactContext, AbortController, setTimeout, clearTimeout,
    redactDesktop: { cancelAnalysis: async () => {},
      analyzeContext: async () => ({ ok: true, engine: "test local model", findings: [{ kind: "name", text: "Morgan Sample" }] }),
    } };
  vm.runInNewContext(await readFile(new URL("../shared/model.js", import.meta.url), "utf8"), context);
  const result = await context.RedactModel.check("Write to Morgan Sample at a@example.com.");
  assert.equal(result.score, 35);
  assert.equal(result.coverage.contextual, true);
  context.redactDesktop.analyzeContext = async () => ({ ok: false, reason: "Local model timed out" });
  const fallback = await context.RedactModel.check("a@example.com");
  assert.equal(fallback.score, 20);
  assert.equal(fallback.coverage.contextual, false);
  assert.equal(fallback.coverage.reason, "Local model timed out");
});

test("oversized contextual inputs receive a full rules scan without model transmission", async () => {
  let calls = 0;
  const context = { Redact, RedactContext, AbortController, setTimeout, clearTimeout,
    redactDesktop: { cancelAnalysis: async () => {}, analyzeContext: async () => { calls++; } } };
  vm.runInNewContext(await readFile(new URL("../shared/model.js", import.meta.url), "utf8"), context);
  const result = await context.RedactModel.check(" ".repeat(7000) + "a@example.com");
  assert.equal(result.score, 20);
  assert.equal(calls, 0);
  assert.match(result.coverage.reason, /6,000/);
});
