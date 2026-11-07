(() => {
  const key = "redact.manualHistory.v1";
  const read = () => {
    const data = JSON.parse(localStorage.getItem(key) || '{"enabled":false,"summaries":[]}');
    return { enabled: data.enabled === true, summaries: Array.isArray(data.summaries) ? data.summaries.slice(0, 200) : [] };
  };
  const write = state => {
    localStorage.setItem(key, JSON.stringify(state));
    return state;
  };
  globalThis.RedactHistory = Object.freeze({
    async getHistory() { return read(); },
    async setHistoryEnabled(enabled) { return write({ ...read(), enabled: enabled === true }); },
    async saveSummary(kinds) {
      const state = read();
      if (!state.enabled) throw new Error("Enable saving before saving a check.");
      const unique = [...new Set(kinds.filter(kind => Object.hasOwn(Redact.categories, kind)))];
      const summary = { provider: "Manual check", timestamp: Date.now(), kinds: unique,
        score: Math.min(100, unique.reduce((total, kind) => total + Redact.categories[kind].points, 0)) };
      return write({ ...state, summaries: [summary, ...state.summaries].slice(0, 200) });
    },
    async clearHistory() { return write({ ...read(), summaries: [] }); },
  });
})();
