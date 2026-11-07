import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesQuery, previewCount, searchCatalog, toolGroups } from "../shared/ai-tools.mjs";

test("directory groups everyday tools with ChatGPT first", () => {
  assert.deepEqual(toolGroups.map(group => group.name), [
    "Chat & search",
    "Writing & study",
    "Images, video & audio",
    "Coding & building",
  ]);
  assert.deepEqual(toolGroups[0].tools.slice(0, 4).map(tool => tool.name), [
    "ChatGPT", "Claude", "Gemini", "Microsoft Copilot",
  ]);
  assert.equal(previewCount, 4);
  assert.ok(toolGroups[0].tools.length > previewCount);
});

test("search finds a tool even when it would be outside the preview row", () => {
  const extra = toolGroups[0].tools.find(tool => tool.id === "deepseek");
  assert.ok(toolGroups[0].tools.indexOf(extra) >= previewCount);
  assert.equal(matchesQuery(extra, "Chat & search", "deep"), true);
  assert.equal(searchCatalog("deepseek")[0].name, "DeepSeek");
  assert.equal(searchCatalog("notebook")[0].group, "Writing & study");
  assert.equal(searchCatalog("no-such-tool").length, 0);
});
