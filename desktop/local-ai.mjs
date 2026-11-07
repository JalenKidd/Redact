import { request } from "node:http";
import "../shared/scanner.js";
import "../shared/context.js";

const MODEL = "qwen3:4b";
const MAX_RESPONSE_BYTES = 512 * 1024;

// Node's HTTP client targets a literal loopback address, ignores proxy environment
// variables, and does not follow redirects. The renderer cannot choose a URL.
export function createLoopbackTransport(port = 11434) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid local port");
  return function localRequest(path, body, signal, timeout = 2500) {
  if (!["/api/status", "/api/tags", "/api/show", "/api/chat"].includes(path)) throw new Error("Invalid local operation");
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = request({ hostname: "127.0.0.1", port, path,
      method: payload ? "POST" : "GET", signal,
      headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {},
    }, response => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error("Local service rejected the request"));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on("data", chunk => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) req.destroy(new Error("Local response too large"));
        else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch { reject(new Error("Invalid local response")); }
      });
    });
    const timer = setTimeout(() => req.destroy(new Error("Local request timed out")), timeout);
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end(payload);
  });
  };
}
export const localRequest = createLoopbackTransport();

export function createLocalAi({ requestJson = localRequest } = {}) {
  let enabled = false;
  let consentRevision = 0;
  let current = null;
  const cancel = () => { current?.abort(); current = null; };
  async function inspect(signal) {
    const status = await requestJson("/api/status", undefined, signal);
    if (status.cloud?.disabled !== true) return { state: "needs-cloud-disabled",
      reason: "Disable Ollama cloud features (OLLAMA_NO_CLOUD=1), restart Ollama, and retry. No draft was transmitted." };
    const list = await requestJson("/api/tags", undefined, signal);
    const model = list.models?.find(item => item.name === MODEL);
    if (!model || model.remote_model || model.remote_host || model.details?.format !== "gguf" ||
        !Number.isFinite(model.size) || model.size < 1000000) {
      return { state: "needs-model", reason: "Install the local model with ollama pull qwen3:4b, then retry. No draft was transmitted." };
    }
    const details = await requestJson("/api/show", { model: MODEL }, signal);
    if (details.remote_model || details.remote_host || details.details?.format !== "gguf" ||
        !details.capabilities?.includes("completion")) return { state: "needs-model",
      reason: "The configured model could not be verified as a local text model. Rules remain available." };
    return { state: enabled ? "available" : "disabled", model: MODEL,
      reason: enabled ? "Local contextual analysis is enabled for this session." :
        "A local model is ready. Enable contextual analysis to send draft checks to Ollama on this computer." };
  }
  async function getStatus() {
    try { return await inspect(AbortSignal.timeout(8000)); }
    catch { return { state: "unavailable", reason: "Ollama is unavailable or its local-only status cannot be verified. Start a current Ollama server with cloud features disabled; rules remain available." }; }
  }
  return Object.freeze({
    getStatus, cancel,
    async setEnabled(value) {
      if (typeof value !== "boolean") throw new Error("Choose a valid AI preference");
      const revision = ++consentRevision;
      cancel();
      enabled = false;
      if (!value) return { state: "disabled", reason: "Contextual AI is disabled. Rules remain available." };
      const status = await getStatus();
      if (revision !== consentRevision) return { state: "disabled", reason: "The AI preference changed. Contextual AI remains disabled." };
      if (status.state !== "disabled") return status;
      enabled = true;
      return { state: "available", model: MODEL, reason: "Local contextual analysis is enabled for this session." };
    },
    async analyze(text) {
      if (typeof text !== "string" || !text.trim() || text.length > 6000) throw new Error("Contextual checks require 1–6,000 characters");
      cancel();
      if (!enabled) return { ok: false, reason: "Contextual AI is disabled; rules only." };
      const controller = new AbortController();
      current = controller;
      const timer = setTimeout(() => controller.abort(), 45000);
      try {
        const status = await inspect(controller.signal);
        if (!enabled || controller.signal.aborted || status.state !== "available") return { ok: false, reason: status.reason };
        const response = await requestJson("/api/chat", {
          model: MODEL, stream: false, think: false, truncate: false,
          format: RedactContext.schema,
          options: { temperature: 0, num_ctx: 8192, num_predict: 2048 },
          keep_alive: "2m",
          messages: [{ role: "system", content: RedactContext.instruction }, { role: "user", content: text }],
        }, controller.signal, 45000);
        if (!enabled || controller.signal.aborted) return { ok: false, reason: "Contextual check cancelled; rules only." };
        if (!response.done || response.done_reason === "length" || response.remote_host || response.remote_model) throw new Error("Incomplete or non-local inference");
        return { ok: true, findings: RedactContext.parse(response.message?.content), engine: `Ollama ${MODEL}` };
      } catch {
        return { ok: false, reason: controller.signal.aborted ? "Contextual check cancelled or timed out; rules only." :
          "Local AI failed, returned incomplete output, or could not be verified. Rules only." };
      } finally {
        clearTimeout(timer);
        if (current === controller) current = null;
      }
    },
  });
}
