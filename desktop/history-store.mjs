import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import "../shared/scanner.js";

const HISTORY_LIMIT = 200;

export function createHistoryStore(file) {
  let pending = Promise.resolve();

  function queue(operation) {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  }

  async function read() {
    let raw;
    try {
      raw = await readFile(file, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return { enabled: false, summaries: [] };
      throw error;
    }
    const state = JSON.parse(raw);
    if (state.version !== 1 || typeof state.enabled !== "boolean" || !Array.isArray(state.summaries)) {
      throw new Error("Redact could not read the saved history format.");
    }
    const summaries = state.summaries.slice(0, HISTORY_LIMIT).map(summary => {
      if (summary.provider !== "Manual check" || !Number.isFinite(summary.timestamp) ||
          Math.abs(summary.timestamp) > 8.64e15 || !Array.isArray(summary.kinds)) {
        throw new Error("Redact could not read a saved summary.");
      }
      return makeSummary(summary.kinds, summary.timestamp);
    });
    return { enabled: state.enabled, summaries };
  }

  async function write(state) {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    const temporary = file + ".tmp";
    try {
      await writeFile(temporary, JSON.stringify({ version: 1, ...state }), { mode: 0o600 });
      await rename(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
    return state;
  }

  return Object.freeze({
    getHistory: () => queue(read),
    setEnabled: enabled => queue(async () => {
      if (typeof enabled !== "boolean") throw new Error("Choose a valid history preference.");
      return write({ ...await read(), enabled });
    }),
    saveSummary: kinds => queue(async () => {
      const state = await read();
      if (!state.enabled) throw new Error("Enable desktop history before saving a check.");
      const summary = makeSummary(kinds, Date.now());
      return write({ ...state, summaries: [summary, ...state.summaries].slice(0, HISTORY_LIMIT) });
    }),
    clear: () => queue(async () => write({ ...await read(), summaries: [] })),
  });
}

function makeSummary(kinds, timestamp) {
  if (!Array.isArray(kinds) || kinds.length > 50 ||
      kinds.some(kind => typeof kind !== "string" || !Object.hasOwn(Redact.categories, kind))) {
    throw new Error("The check contains invalid category labels.");
  }
  const unique = [...new Set(kinds)];
  const score = Math.min(100, unique.reduce((total, kind) => total + Redact.categories[kind].points, 0));
  return { provider: "Manual check", timestamp, score, kinds: unique };
}
