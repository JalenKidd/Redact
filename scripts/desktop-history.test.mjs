import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createHistoryStore } from "../desktop/history-store.mjs";

test("desktop consent, atomic concurrent writes, persistence, and clearing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "redact-history-"));
  try {
    const file = join(directory, "history.json");
    const history = createHistoryStore(file);
    assert.deepEqual(await history.getHistory(), { enabled: false, summaries: [] });
    await assert.rejects(history.saveSummary(["phone"]), /Enable desktop history/);
    await history.setEnabled(true);
    await Promise.all([history.saveSummary(["phone", "phone", "student"]), history.saveSummary([])]);
    const state = await createHistoryStore(file).getHistory();
    assert.equal(state.enabled, true);
    assert.deepEqual(state.summaries.map(summary => summary.score), [0, 50]);
    assert.deepEqual(Object.keys(state.summaries[0]).sort(), ["kinds", "provider", "score", "timestamp"]);
    assert.equal(state.summaries[0].provider, "Manual check");
    await assert.rejects(history.saveSummary(["made-up"]), /invalid category/);
    assert.equal((await history.getHistory()).summaries.length, 2);
    await history.setEnabled(false);
    assert.equal((await history.getHistory()).summaries.length, 2);
    await history.clear();
    assert.deepEqual(await history.getHistory(), { enabled: false, summaries: [] });
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { version: 1, enabled: false, summaries: [] });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
