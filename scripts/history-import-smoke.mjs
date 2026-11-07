import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const profile = await mkdtemp(join(tmpdir(), "redact-import-test-"));
const entry = (id, parts, contentType = "text", role = "user") => ({
  id, parent: null, message: { id, author: { role }, create_time: 1700000000,
    content: { content_type: contentType, parts } },
});
const exportData = [{ id: "synthetic-conversation", title: "Synthetic export only", current_node: "secret", mapping: {
  secret: entry("secret", ["My password is Synthetic-Only-PrivateMarker-123"]),
  name: entry("name", ["My name is Avery Example and I live at 21 Demo Lane."]),
  partial: entry("partial", ["a@example.com", { content_type: "image_asset_pointer" }], "multimodal_text"),
  audio: entry("audio", [{ audio: "placeholder" }], "audio"),
  assistant: entry("assistant", ["password=never-count-this-assistant-secret"], "text", "assistant"),
} }];
const file = (name, value) => ({ name, mimeType: "application/json", buffer: Buffer.from(typeof value === "string" ? value : JSON.stringify(value)) });
let app;
try {
  app = await _electron.launch({ args: [
    ...(process.env.REDACT_HEADLESS === "1" ? ["-r", join(root, "scripts", "desktop-headless-bootstrap.cjs")] : []),
    root, ...(process.env.REDACT_HEADLESS === "1" ? ["--ozone-platform=headless", "--disable-gpu"] : []),
  ], env: { ...process.env, REDACT_USER_DATA_DIR: profile } });
  const page = await app.firstWindow();
  await page.getByRole("button", { name: "Open Redact", exact: false }).click();
  await page.waitForFunction(() => document.getElementById("welcome-screen").hidden);
  await page.getByRole("link", { name: /Exposure history/ }).click();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.evaluate(() => {
    window.bulkModelCalls = 0;
    const original = RedactModel;
    window.RedactModel = { ...original, check: (...args) => { window.bulkModelCalls++; return original.check(...args); } };
  });
  await page.locator("#history-files").setInputFiles([file("conversations-000.json", exportData), file("conversations-001.json", exportData)]);
  await page.waitForSelector("#import-preview", { state: "visible" });
  assert.match(await page.locator("#import-preview-summary").innerText(), /4 unique user prompts/);
  assert.match(await page.locator("#import-warnings").innerText(), /4 duplicate prompts/);
  assert.equal(await page.locator("#import-results").isVisible(), false);
  await page.getByRole("button", { name: "Deselect all conversations" }).click();
  assert.equal(await page.getByRole("button", { name: "Analyze selected conversations" }).isDisabled(), true);
  await page.getByRole("button", { name: "Select all conversations", exact: true }).click();
  await page.getByRole("button", { name: "Analyze selected conversations" }).click();
  await page.waitForSelector("#import-results", { state: "visible" });
  assert.match(await page.locator("#import-status").innerText(), /4 imported user prompts/);
  const stats = await page.locator("#import-stats").innerText();
  assert.match(stats, /Mean full-text score\s+53\/100/);
  assert.match(stats, /Unscanned prompts\s+1/);
  assert.equal(await page.locator("#import-table tbody tr").count(), 4);
  assert.equal(await page.locator("#import-table tbody tr").first().locator("td").nth(1).innerText(), "60/100");
  assert.equal(await page.evaluate(() => window.bulkModelCalls), 0);
  assert.equal(await page.evaluate(async () => (await redactDesktop.getHistory()).summaries.length), 0);
  assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }).includes("PrivateMarker")), false);
  await page.locator("#import-table").getByRole("button", { name: "Inspect prompt" }).first().click();
  assert.match(await page.locator(".import-prompt-text").innerText(), /PrivateMarker/);
  assert.match(await page.locator("#modal-content").innerText(), /Credential or API key: \+60/);
  await page.getByRole("button", { name: "Open in prompt scanner" }).click();
  assert.match(await page.locator("#prompt").inputValue(), /PrivateMarker/);
  assert.equal(await page.locator("#score-value").innerText(), "—");
  // Imported detail opened for review, but is not sent to any analysis/model automatically.
  assert.equal(await page.evaluate(() => window.bulkModelCalls), 0);
  await page.locator("#clear-draft").click();
  await page.getByRole("link", { name: /Exposure history/ }).click();
  await page.locator("#import-filter").selectOption("unscanned");
  assert.equal(await page.locator("#import-table tbody tr").count(), 1);
  assert.match(await page.locator("#import-table").innerText(), /Not scored/);
  await page.locator("#import-filter").selectOption("partial");
  assert.match(await page.locator("#import-table").innerText(), /≥ 20\/100/);
  await page.locator("#import-filter").selectOption("all");
  await page.locator("#import-category").selectOption("name");
  assert.equal(await page.locator("#import-table tbody tr").count(), 1);
  await page.locator("#import-category").selectOption("all");
  // A malformed replacement does not destroy the existing successful import.
  await page.locator("#history-files").setInputFiles(file("bad.json", "{"));
  await page.waitForFunction(() => document.getElementById("import-status").textContent.includes("not valid JSON"));
  assert.equal(await page.locator("#import-table tbody tr").count(), 4);
  // Imported markup stays inert, including in titles and inspected text.
  const xss = structuredClone(exportData);
  xss[0].title = '<img src=x onerror="window.importExecuted=true">';
  xss[0].mapping.secret.message.content.parts = ['<script>window.importExecuted=true</script> a@example.com'];
  await page.locator("#history-files").setInputFiles(file("xss.json", xss));
  await page.waitForSelector("#import-preview", { state: "visible" });
  assert.equal(await page.locator("#import-conversations img").count(), 0);
  await page.getByRole("button", { name: "Analyze selected conversations" }).click();
  await page.waitForFunction(() => document.getElementById("import-status").textContent.includes("imported user prompts"));
  assert.equal(await page.locator("#import-table img").count(), 0);
  assert.equal(await page.evaluate(() => window.importExecuted), undefined);
  // Cancelling a pending import discards its worker and does not resurrect its results.
  await page.locator("#history-files").setInputFiles(file("cancel.json", exportData));
  await page.waitForSelector("#import-preview", { state: "visible" });
  await page.getByRole("button", { name: "Cancel import", exact: true }).click();
  assert.equal(await page.locator("#import-preview").isVisible(), false);
  assert.match(await page.locator("#import-status").innerText(), /Import cancelled/);
  // Show all results at minimum supported desktop width without page overflow.
  await page.setViewportSize({ width: 720, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole("button", { name: "Clear imported history", exact: true }).click();
  await page.getByRole("button", { name: "Clear imported text", exact: true }).click();
  assert.equal(await page.locator("#import-results").isVisible(), false);
  assert.equal(await page.locator("#import-table").innerText(), "");
  assert.equal(await page.locator("#modal-content").innerText(), "");
  assert.equal(await page.evaluate(async () => (await redactDesktop.getHistory()).summaries.length), 0);
  await page.reload();
  await page.getByRole("link", { name: /Exposure history/ }).click();
  assert.equal(await page.locator("#import-results").isVisible(), false);
  assert.deepEqual(errors, []);
  console.log("History import passed real Electron worker parsing, preview/selection, duplicates, scores/coverage, inspection, draft handoff, malformed replacement, inert markup, cancellation, clearing, reload, and summary isolation.");
} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
