import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import "../shared/scanner.js";
import "../shared/history-import.js";

const message = (id, role, parts, parent = null, extras = {}) => ({ id, parent, children: [], message: {
  id, author: { role }, create_time: 1700000000,
  content: { content_type: "text", parts }, ...extras,
} });
function conversation(id = "conversation-1") {
  return { id, title: "Synthetic conversation", create_time: 1700000000, current_node: "assistant",
    mapping: {
      root: { id: "root", message: null, parent: null },
      first: message("first", "user", ["My name is Avery Example and I live at 21 Demo Lane."], "root"),
      alternate: message("alternate", "user", ["a@example.com"], "root"),
      assistant: message("assistant", "assistant", ["password=assistant-secret-only"], "first"),
    } };
}
const parse = value => RedactImport.parseExports([{ text: JSON.stringify(value) }]);
const analyze = async dataset => RedactImport.analyze(dataset, dataset.conversations.map(c => c.id), { yieldTask: async () => {} });

test("imports user prompts, branch identity and source timestamps without assistant text", async () => {
  const dataset = parse([conversation()]);
  assert.equal(dataset.stats.prompts, 2);
  assert.equal(dataset.stats.otherMessages, 1);
  assert.equal(dataset.conversations[0].prompts.find(p => p.id === "first").branch, "current");
  assert.equal(dataset.conversations[0].prompts.find(p => p.id === "alternate").branch, "alternate");
  assert.equal(dataset.conversations[0].prompts[0].timestamp, 1700000000000);
  assert.ok(!JSON.stringify(dataset).includes("assistant-secret-only"));
  const result = await analyze(dataset);
  assert.deepEqual(result.rows.map(row => row.result.score), [45, 20]);
  assert.equal(result.summary.mean, 33);
  assert.equal(result.summary.categories.find(item => item.kind === "address").count, 1);
  assert.equal(result.summary.months[0].month, "2023-11");
});

test("previews contain counts and titles, but no prompt bodies", () => {
  const preview = RedactImport.preview(parse([conversation()]));
  assert.equal(preview.conversations[0].prompts, 2);
  assert.ok(!JSON.stringify(preview).includes("Avery"));
});

test("supports array, single-conversation and conversations wrapper roots, including BOM", () => {
  for (const root of [[conversation()], conversation(), { conversations: [conversation()] }]) assert.equal(parse(root).stats.prompts, 2);
  assert.equal(RedactImport.parseExports([{ text: "\uFEFF" + JSON.stringify([conversation()]) }]).stats.prompts, 2);
});

test("numbered files merge stable IDs, deduplicate repeated nodes and retain alternate branches", async () => {
  const first = conversation();
  const second = structuredClone(first);
  second.mapping.new = message("new", "user", ["My password is Sunshine123"], "assistant");
  const dataset = RedactImport.parseExports([{ text: JSON.stringify([first]) }, { text: JSON.stringify([second]) }]);
  assert.equal(dataset.stats.conversations, 1);
  assert.equal(dataset.stats.prompts, 3);
  assert.equal(dataset.stats.duplicates, 2);
  assert.equal((await analyze(dataset)).summary.high, 1);
});

test("same text on different branches or different conversations remains separate", () => {
  const first = conversation();
  first.mapping.alternate.message.content.parts = first.mapping.first.message.content.parts;
  const dataset = parse([first, conversation("conversation-2")]);
  assert.equal(dataset.stats.prompts, 4);
  assert.equal(dataset.stats.duplicates, 0);
});

test("conflicting copies of a stable ID are reported and never silently overwrite the first", () => {
  const first = conversation(), second = conversation();
  second.mapping.first.message.content.parts = ["changed@example.com"];
  const dataset = parse([first, second]);
  assert.equal(dataset.stats.conflicts, 1);
  assert.equal(dataset.stats.duplicates, 1);
  assert.match(dataset.conversations[0].prompts[0].text, /Avery/);
});

test("attachments and multimodal parts create partial or unscanned coverage and do not count toward the mean", async () => {
  const source = conversation();
  source.mapping.first.message.content = { content_type: "multimodal_text", parts: ["a@example.com", { content_type: "image_asset_pointer", asset_pointer: "https://never-fetch.example/image" }] };
  source.mapping.alternate.message.content = { content_type: "audio", parts: [{ audio: "pointer" }] };
  const dataset = parse(source), result = await analyze(dataset);
  assert.equal(dataset.stats.partial, 1);
  assert.equal(dataset.stats.unsupported, 1);
  assert.equal(result.rows[0].result.score, 20);
  assert.equal(result.rows[0].coverage, "partial");
  assert.equal(result.rows[1].result, null);
  assert.equal(result.summary.mean, null);
  assert.equal(result.summary.unscanned, 1);
  assert.equal(result.summary.months[0].mean, null);
  assert.ok(!JSON.stringify(dataset).includes("never-fetch"));
});

test("metadata attachment references make otherwise plain text a partial scan", () => {
  const source = conversation();
  source.mapping.first.message.metadata = { attachments: [{ id: "image-file" }] };
  assert.equal(parse(source).conversations[0].prompts[0].coverage, "partial");
});

test("oversized prompts stay unscored, visibly truncated, and cannot masquerade as zero", async () => {
  const source = conversation();
  source.mapping.first.message.content.parts = ["x".repeat(20001)];
  const dataset = parse(source), result = await analyze(dataset);
  assert.equal(dataset.stats.oversized, 1);
  assert.equal(result.rows[0].result, null);
  assert.equal(result.rows[0].truncated, true);
  assert.equal(result.rows[0].text.length, 20000);
  assert.equal(result.rows[0].originalLength, 20001);
  assert.equal(result.summary.mean, 20);
});

test("invalid dates remain unknown rather than receiving invented conversation dates", () => {
  const source = conversation(); source.mapping.first.message.create_time = "invalid";
  assert.equal(parse(source).conversations[0].prompts[0].timestamp, null);
});

test("cycles and dangling current branches are bounded and marked unknown", () => {
  for (const value of ["cycle", "missing"]) {
    const source = conversation();
    if (value === "cycle") source.mapping.first.parent = "assistant";
    else source.current_node = "missing-node";
    const dataset = parse(source);
    assert.equal(dataset.stats.branchWarnings, 1);
    assert.ok(dataset.conversations[0].prompts.every(p => p.branch === "unknown"));
  }
});

test("malformed records are counted alongside usable conversations", () => {
  const source = conversation(); source.mapping.invalid = { message: { author: null } };
  const dataset = parse([null, {}, source]);
  assert.equal(dataset.stats.malformed, 3);
  assert.equal(dataset.stats.prompts, 2);
});

test("unsupported roots, malformed JSON and exports without user prompts fail with useful errors", () => {
  for (const text of ["<html>export</html>", "{", "null", '{"messages":[]}', "[]"]) {
    assert.throws(() => RedactImport.parseExports([{ text }]));
  }
  const source = conversation();
  source.mapping.first.message.author.role = "system";
  source.mapping.alternate.message.author.role = "tool";
  assert.throws(() => parse(source), /No user prompts/);
});

test("resource and selection limits reject whole jobs rather than silently dropping records", async () => {
  assert.throws(() => RedactImport.parseExports([]));
  assert.throws(() => RedactImport.parseExports(Array.from({ length: 21 }, () => ({ text: "[]" }))));
  assert.throws(() => parse(Array.from({ length: 1001 }, () => conversation())), /1,000/);
  const many = conversation();
  many.mapping = Object.fromEntries(Array.from({ length: 25001 }, (_, i) => [String(i), { message: null }]));
  assert.throws(() => parse(many), /25,000/);
  const tooMuchText = conversation();
  tooMuchText.mapping.first.message.content.parts = ["x".repeat(RedactImport.limits.text + 1)];
  assert.throws(() => parse(tooMuchText), /million/);
  const dataset = parse(conversation());
  await assert.rejects(RedactImport.analyze(dataset, []), /Select/);
  await assert.rejects(RedactImport.analyze(dataset, ["unknown"]), /invalid/);
});

test("analysis respects selected conversations, progress and cancellation", async () => {
  const dataset = parse([conversation(), conversation("conversation-2")]);
  const progress = [];
  const result = await RedactImport.analyze(dataset, ["conversation-2"], { onProgress: event => progress.push(event), yieldTask: async () => {} });
  assert.equal(result.rows.length, 2);
  assert.ok(result.rows.every(row => row.conversationId === "conversation-2"));
  assert.deepEqual(progress, [{ completed: 2, total: 2 }]);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(RedactImport.analyze(dataset, ["conversation-1"], { signal: controller.signal }), /cancelled/);
});

test("prototype-shaped IDs are data, and imported markup never becomes executable code", async () => {
  const source = conversation("__proto__");
  source.title = '<img src=x onerror="alert(1)">';
  source.mapping.first.message.content.parts = ['<script>globalThis.importExecuted=true</script> a@example.com'];
  const result = await analyze(parse(source));
  assert.equal(result.rows[0].result.score, 20);
  assert.match(result.rows[0].text, /<script>/);
  assert.equal(globalThis.importExecuted, undefined);
});

test("cancellation between analysis batches does not return a partial result as complete", async () => {
  const source = conversation();
  for (let i = 0; i < 80; i++) source.mapping[`extra-${i}`] = message(`extra-${i}`, "user", ["Synthetic text"]);
  const dataset = parse(source), controller = new AbortController();
  const progress = [];
  await assert.rejects(RedactImport.analyze(dataset, [source.id], {
    signal: controller.signal, onProgress: event => progress.push(event),
    yieldTask: async () => { controller.abort(); },
  }), /cancelled/);
  assert.deepEqual(progress, [{ completed: 25, total: 82 }]);
});

test("file byte limits, prompt count limits and duplicate selections are enforced", async () => {
  assert.throws(() => RedactImport.parseExports([{ text: " ".repeat(RedactImport.limits.bytes + 1) }]), /16 MiB/);
  const source = conversation();
  source.mapping = Object.fromEntries(Array.from({ length: 10001 }, (_, i) => [String(i), message(String(i), "user", ["text"])]));
  assert.throws(() => parse(source), /10,000/);
  const dataset = parse(conversation());
  await assert.rejects(RedactImport.analyze(dataset, ["conversation-1", "conversation-1"]), /invalid/);
});

test("the included fictional export exercises ranking, coverage gaps and monthly trends", async () => {
  const text = await readFile(new URL("../examples/chatgpt-synthetic.json", import.meta.url), "utf8");
  const result = await analyze(RedactImport.parseExports([{ text }]));
  assert.equal(result.rows.length, 5);
  assert.equal(result.summary.complete, 3);
  assert.equal(result.summary.partial, 1);
  assert.equal(result.summary.unscanned, 1);
  assert.equal(result.summary.mean, 40);
  assert.equal(result.summary.high, 1);
  assert.equal(result.summary.months.length, 2);
});
