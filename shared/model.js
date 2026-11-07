(() => {
  let current = null;

  async function availability() {
    try {
      if (globalThis.redactDesktop?.getAiStatus) return (await redactDesktop.getAiStatus()).state;
      if (typeof globalThis.LanguageModel?.availability !== "function") return "unavailable";
      return await LanguageModel.availability();
    } catch {
      return "unavailable";
    }
  }

  async function enable(onProgress) {
    if (globalThis.redactDesktop?.configureAi) return redactDesktop.configureAi(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180_000);
    try {
      const session = await LanguageModel.create({
        signal: controller.signal,
        monitor(monitor) {
          monitor.addEventListener("downloadprogress", event => onProgress(Math.round(event.loaded * 100)));
        },
      });
      session.destroy();
    } finally {
      clearTimeout(timer);
    }
  }

  function cancel() {
    current?.abort();
    current = null;
    if (globalThis.redactDesktop?.cancelAnalysis) void redactDesktop.cancelAnalysis().catch(() => {});
  }

  async function check(text) {
    cancel();
    const baseline = Redact.scan(text);
    const fallback = reason => ({ ...baseline, contextual: false,
      coverage: { ...baseline.coverage, contextual: false, reason } });
    if (text.length > 6000) return fallback("Contextual analysis is limited to 6,000 characters; the full draft received a rules scan.");
    const controller = new AbortController();
    current = controller;
    const timer = setTimeout(() => controller.abort(), globalThis.redactDesktop ? 45000 : 10000);
    let session;
    try {
      if (globalThis.redactDesktop?.analyzeContext) {
        const reply = await redactDesktop.analyzeContext(text);
        if (controller.signal.aborted) return fallback("Contextual check cancelled.");
        if (!reply.ok) return fallback(reply.reason);
        const findings = RedactContext.parse(JSON.stringify({ findings: reply.findings }));
        const result = Redact.scan(text, findings);
        return { ...result, contextual: true, coverage: { ...result.coverage, contextual: true, engine: reply.engine } };
      }
      if (await availability() !== "available") return fallback("Contextual AI is unavailable; rules only.");
      session = await LanguageModel.create({
        signal: controller.signal,
        initialPrompts: [{
          role: "system",
          content: RedactContext.instruction,
        }],
      });
      const raw = await session.prompt(text, { responseConstraint: RedactContext.schema, signal: controller.signal });
      const result = Redact.scan(text, RedactContext.parse(raw));
      return { ...result, contextual: true, coverage: { ...result.coverage, contextual: true, engine: "Chrome local model" } };
    } catch {
      return fallback(controller.signal.aborted ? "Contextual check timed out or was cancelled; rules only." : "Contextual AI failed or returned invalid output; rules only.");
    } finally {
      clearTimeout(timer);
      session?.destroy();
      if (current === controller) current = null;
    }
  }

  globalThis.RedactModel = Object.freeze({ availability, check, enable, cancel });
})();
