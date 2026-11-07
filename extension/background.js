importScripts("scanner.js", "config.js");

const CHATGPT = "https://chatgpt.com";
const PANEL = chrome.runtime.getURL("popup.html");
const HISTORY_LIMIT = 200;
let pending = Promise.resolve();

function originOf(url) {
  try { return new URL(url).origin; } catch { return ""; }
}

function queued(operation, reply) {
  const result = pending.then(operation);
  pending = result.catch(() => {});
  result.then(reply, () => reply({ error: "Local storage is unavailable." }));
  return true;
}

async function getHistory() {
  const { enabled, summaries } = await chrome.storage.local.get(["enabled", "summaries"]);
  return { enabled: enabled === true, summaries: summaries || [] };
}

chrome.runtime.onMessageExternal.addListener((message, sender, reply) => {
  if (message?.type !== "REDACT_HISTORY") return;
  const fromDashboard = RedactConfig.allowedOrigins.includes(originOf(sender.url));
  const fromPages = sender.url?.startsWith(RedactConfig.pagesUrl);
  if (!fromDashboard && !fromPages) return;
  return queued(getHistory, reply);
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  const isPanel = sender.url === PANEL;
  const isChat = originOf(sender.url) === CHATGPT && sender.frameId === 0;
  if (message?.type === "REDACT_PREFERENCES" && (isPanel || isChat)) {
    return queued(async () => {
      const { enabled, summaries, autoRedact } = await chrome.storage.local.get(["enabled", "summaries", "autoRedact"]);
      return { enabled: enabled === true, count: summaries?.length || 0, autoRedact: autoRedact !== false };
    }, reply);
  }
  if (message?.type === "REDACT_SET_AUTO" && isPanel && typeof message.enabled === "boolean") {
    return queued(async () => {
      await chrome.storage.local.set({ autoRedact: message.enabled });
      return { autoRedact: message.enabled };
    }, reply);
  }
  if (message?.type === "REDACT_SET_HISTORY" && isPanel && typeof message.enabled === "boolean") {
    return queued(async () => {
      await chrome.storage.local.set({ enabled: message.enabled });
      return { enabled: message.enabled };
    }, reply);
  }
  if (message?.type === "REDACT_CLEAR_HISTORY" && isPanel) {
    return queued(async () => {
      await chrome.storage.local.set({ summaries: [] });
      return { cleared: true };
    }, reply);
  }
  if (message?.type === "REDACT_LOG" && isChat && Array.isArray(message.kinds)) {
    return queued(async () => {
      const { enabled, summaries } = await getHistory();
      if (!enabled) return { saved: false };
      const kinds = [...new Set(message.kinds.filter(kind => typeof kind === "string" && Object.hasOwn(Redact.categories, kind)))];
      const score = Math.min(100, kinds.reduce((total, kind) => total + Redact.categories[kind].points, 0));
      const summary = { provider: "ChatGPT", timestamp: Date.now(), score, kinds };
      if (Number.isSafeInteger(message.redactedCount) && message.redactedCount > 0 && message.redactedCount <= 20_000) {
        summary.redactedCount = message.redactedCount;
        summary.redactionId = crypto.randomUUID();
      }
      await chrome.storage.local.set({ summaries: [summary, ...summaries].slice(0, HISTORY_LIMIT) });
      return { saved: true };
    }, reply);
  }
});
