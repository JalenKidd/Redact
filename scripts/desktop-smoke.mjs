import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const profile = await mkdtemp(join(tmpdir(), "redact-electron-test-"));
let application;
try {
  const executablePath = process.argv[2];
  const launch = () => _electron.launch({ executablePath, args: [
    ...(process.env.REDACT_HEADLESS === "1" && !executablePath ? ["-r", join(root, "scripts", "desktop-headless-bootstrap.cjs")] : []),
    ...(executablePath ? [] : [root]),
    ...(process.env.REDACT_HEADLESS === "1" ? ["--ozone-platform=headless", "--disable-gpu"] : []),
  ], env: { ...process.env, REDACT_USER_DATA_DIR: profile } });
  application = await launch();
  let page = await application.firstWindow();
  await page.waitForSelector("#load-example");
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  assert.equal(await page.title(), "Redact — Think before you send.");
  assert.equal(await page.evaluate(() => typeof require), "undefined");
  await page.locator("#prompt").fill("My name is Avery Example and I live at 21 Demo Lane.");
  await page.getByRole("button", { name: "Check my prompt" }).click();
  await page.waitForFunction(() => !document.getElementById("check-prompt").disabled);
  assert.equal(await page.locator("#score-value").innerText(), "45");
  assert.match(await page.locator("#rewrite-comparison").innerText(), /Original 45\/100 → Revised 0\/100/);
  await page.locator("#prompt").fill("I have type 1 diabetes. Email me at a@example.com. Write 3 questions for my doctor.");
  await page.getByRole("button", { name: "Check my prompt" }).click();
  await page.waitForFunction(() => !document.getElementById("check-prompt").disabled);
  await page.getByLabel("Personal health detail 1", { exact: false }).selectOption("keep");
  assert.match(await page.locator("#rewrite-comparison").innerText(), /Revised 25\/100/);
  assert.match(await page.locator("#rewritten").innerText(), /type 1 diabetes.+\[email\]/);
  await page.getByRole("button", { name: "Replace draft", exact: false }).click();
  assert.equal(await page.locator("#score-value").innerText(), "25");
  assert.match(await page.locator("#prompt").inputValue(), /Write 3 questions for my doctor\./);
  await page.locator("#prompt").fill("changed draft");
  assert.equal(await page.locator("#score-value").innerText(), "—");
  assert.equal(await page.locator("#rewrite-card").isVisible(), false);
  await page.evaluate(() => {
    window.savedModel = RedactModel;
    window.RedactModel = { ...RedactModel, check: text => new Promise(resolve => {
      window.finishStaleCheck = () => resolve(Redact.scan(text));
    }) };
  });
  await page.locator("#prompt").fill("old@example.com");
  await page.getByRole("button", { name: "Check my prompt" }).click();
  await page.locator("#prompt").fill("A new draft without the old email");
  await page.evaluate(() => { window.finishStaleCheck(); window.RedactModel = window.savedModel; });
  assert.equal(await page.locator("#score-value").innerText(), "—");
  await page.getByRole("button", { name: /Check contextual AI availability/ }).click();
  await page.waitForFunction(() => !document.querySelector("#modal-content p")?.textContent.includes("Checking the local"));
  assert.match(await page.locator("#modal-content").innerText(), /Ollama|local model/);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Try a fictional example" }).click();
  await page.getByRole("button", { name: "Check my prompt" }).click();
  assert.equal(await page.locator("#score-value").innerText(), "50");
  await page.getByRole("button", { name: "Replace draft", exact: false }).click();
  assert.equal(await page.locator("#score-value").innerText(), "0");
  await page.getByRole("button", { name: "Save check", exact: true }).click();
  await page.getByRole("checkbox", { name: "Allow saving manual checks" }).check();
  await page.waitForFunction(async () => (await window.redactDesktop.getHistory()).enabled);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Save check", exact: true }).click();
  await page.waitForFunction(() => document.getElementById("save-check").textContent === "Saved ✓");
  await page.getByRole("link", { name: /Exposure history/ }).click();
  await page.waitForSelector(".history-score b");
  assert.equal(await page.locator(".history-score b").innerText(), "0");
  assert.match(await page.locator(".history-table").innerText(), /Manual check/);
  assert.deepEqual(errors, []);
  await application.close();
  application = await launch();
  page = await application.firstWindow();
  await page.getByRole("link", { name: /Exposure history/ }).click();
  await page.waitForSelector(".history-score b");
  assert.equal(await page.locator(".history-score b").innerText(), "0");
  await page.getByRole("button", { name: "History settings", exact: true }).click();
  await page.getByRole("button", { name: "Clear desktop history", exact: true }).click();
  await page.getByRole("button", { name: "Clear history", exact: true }).click();
  await page.waitForFunction(async () => (await window.redactDesktop.getHistory()).summaries.length === 0);
  console.log("Electron passed new name/address detection, keep/replace choices, 45 → 25 health comparison, stale-draft reset, local AI setup, isolated rendering, 50 → 0 demo, opt-in saving, restart persistence, and clearing.");
} finally {
  await application?.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
