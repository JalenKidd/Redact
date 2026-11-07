import { toolGroups } from "./ai-tools.mjs";

const providerNames = new Map(toolGroups.flatMap(group => group.tools.map(tool => [tool.id, tool.name])));
providerNames.set("any", "Any AI tool");
export const activityProviderName = id => providerNames.get(id);
const validTime = value => Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15;
export const activityLimit = 60;

export function cleanActivity(value) {
  if (!value || typeof value.id !== "string" || !/^[a-f0-9-]{36}$/.test(value.id) ||
      !validTime(value.timestamp) || !providerNames.has(value.provider) ||
      !Number.isSafeInteger(value.count) || value.count < 1 || value.count > 20_000 ||
      (value.kind !== "draft-redacted" && !(value.kind === "chat-sent" && value.provider === "chatgpt"))) return null;
  const { id, timestamp, provider, count, kind } = value;
  return { id, timestamp, provider, count, kind };
}

export function mergeActivity(first = {}, second = {}) {
  const clearedAt = Math.max(validTime(first.clearedAt) ? first.clearedAt : 0, validTime(second.clearedAt) ? second.clearedAt : 0);
  const byId = new Map();
  for (const list of [first.events, second.events]) {
    if (!Array.isArray(list)) continue;
    for (const value of list.slice(0, activityLimit)) {
      const event = cleanActivity(value);
      if (event && event.timestamp > clearedAt) byId.set(event.id, event);
    }
  }
  const events = [...byId.values()].sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id));
  return { events: events.slice(0, activityLimit), clearedAt };
}
