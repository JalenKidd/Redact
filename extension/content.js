(() => {
  const host = document.createElement("div");
  host.id = "redact-assistant";
  const root = host.attachShadow({ mode: "closed" });
  // Bundled CSS lives in the isolated shadow tree.
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; display: flex; justify-content: flex-end; margin: 5px 0; color-scheme: light; }
    * { box-sizing: border-box; }
    .wrap { position: relative; font: 13px/1.45 system-ui, sans-serif; color: #211f1b; }
    button { font: inherit; cursor: pointer; }
    button:focus-visible { outline: 2px solid #a1321e; outline-offset: 3px; }
    button:disabled { opacity: .55; cursor: default; }
    .launch { border: 1px solid #5d5549; border-radius: 9px; background: #22211e; color: #fffaf0; padding: 6px 12px; display: flex; align-items: center; gap: 7px; font-weight: 650; }
    .mark { color: #ff704f; font-size: 14px; line-height: 1; }
    .auto-state { border-left: 1px solid #7d786f; padding-left: 7px; color: #c6edd0; font-size: 11px; font-weight: 550; }
    .panel { position: absolute; right: 0; bottom: calc(100% + 10px); z-index: 2147483647; width: min(360px, 86vw); max-height: min(460px, 57vh); overflow: auto; border: 1px solid #ded9cd; border-radius: 16px; padding: 16px; background: #fffefa; box-shadow: 0 16px 52px #15110c44; }
    .panel:not([hidden]) { animation: redact-panel .22s cubic-bezier(.2,.74,.26,1) both; }
    @keyframes redact-panel { from { opacity: 0; transform: translateY(7px); } }
    @media (prefers-reduced-motion: reduce) { .panel:not([hidden]) { animation: none; } }
    [hidden] { display: none !important; }
    .top, .row, .actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .eyebrow { color: #a1321e; font: 700 10px/1.5 ui-monospace, monospace; letter-spacing: .09em; }
    .close { border: 0; background: transparent; font-size: 22px; line-height: 1; color: #211f1b; }
    .score { margin: 7px 0; font-size: 21px; letter-spacing: -.04em; font-weight: 750; }
    .reasons { margin: 6px 0 12px; padding: 0; list-style: none; }
    .row { padding: 5px 0; border-bottom: 1px solid #ded9cd; }
    .row span:last-child { color: #a1321e; font-family: ui-monospace, monospace; }
    .rewrite { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 135px; overflow: auto; color: #275744; background: #e3eee5; border-radius: 8px; padding: 8px; margin: 4px 0 10px; }
    .main { border: 0; background: #22211e; color: #fffaf0; padding: 7px 10px; border-radius: 8px; font-weight: 750; }
    .quiet { border: 0; color: #a1321e; background: transparent; padding: 5px 0; text-align: left; }
    .status { color: #686259; margin: 5px 0 9px; }
    .chat-context { margin: 8px 0; color: #514936; font-size: 12px; }
    .send-alert { position: absolute; right: 0; bottom: calc(100% + 8px); z-index: 2147483647; width: max-content; max-width: 75vw; border-radius: 10px; padding: 9px 12px; background: #22211e; color: #fffaf0; box-shadow: 0 6px 22px #15110c44; }
  `;
  const wrap = document.createElement("div");
  wrap.className = "wrap";
  wrap.innerHTML = `
    <button type="button" class="launch" aria-label="Check with Redact" aria-expanded="false" aria-controls="redact-panel"><span class="mark" aria-hidden="true">▰</span> Check with Redact <span class="auto-state">Loading</span></button>
    <div class="send-alert" role="status" hidden></div>
    <section class="panel" id="redact-panel" aria-label="Redact exposure check" hidden>
      <div class="top"><span class="eyebrow">REDACT / DRAFT CHECK</span><button class="close" type="button" aria-label="Close draft check">×</button></div>
      <div class="score" aria-live="polite"></div>
      <div class="status" role="status"></div>
      <p class="chat-context"></p>
      <ul class="reasons" hidden></ul>
      <div class="suggestion" hidden><span class="eyebrow">SUGGESTED DRAFT</span><div class="rewrite"></div></div>
      <div class="actions">
        <button class="quiet enable" type="button" hidden>Enable contextual AI</button>
        <button class="main replace" type="button" hidden>Replace draft</button>
      </div>
    </section>
  `;
  root.append(style, wrap);
  const launch = root.querySelector(".launch");
  const panel = root.querySelector(".panel");
  const score = root.querySelector(".score");
  const status = root.querySelector(".status");
  const reasons = root.querySelector(".reasons");
  const suggestion = root.querySelector(".suggestion");
  const rewrite = root.querySelector(".rewrite");
  const replace = root.querySelector(".replace");
  const enable = root.querySelector(".enable");
  const context = root.querySelector(".chat-context");
  const sendAlert = root.querySelector(".send-alert");
  const autoState = root.querySelector(".auto-state");

  const turnSelector = '[data-message-author-role="user"], [data-user-message-bubble="true"]';
  const userTurns = () => [...document.querySelectorAll(turnSelector)].filter(turn => !turn.parentElement.closest(turnSelector));
  const sendSelector = [
    'button[data-testid="send-button"], button#composer-submit-button[aria-label="Send prompt"]',
    'button[data-composer-submit][data-send-label]',
    'form[data-chatgpt-composer] button[type="submit"]',
  ].join(", ");
  const seenTurns = new WeakSet();
  let composer = null;
  let review = null;
  let scanVersion = 0;
  let historyEnabled = false;
  let mode = null;
  let staged = null;
  let expiry;
  let appliedRedaction = null;
  let alertTimer;
  let pendingSend = false;

  function read(element) {
    return element instanceof HTMLTextAreaElement ? element.value : element?.innerText || "";
  }

  function normalize(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function draftComposer() {
    return document.querySelector([
      '#prompt-textarea, textarea[data-testid="prompt-textarea"], [contenteditable="true"][data-testid="prompt-textarea"]',
      'form[data-mobile-composer] textarea[data-mobile-composer-prompt]',
      '[data-composer-surface-variant="default"] [contenteditable="true"][data-composer-markdown]',
    ].join(", "));
  }

  function setPanel(open) {
    panel.hidden = !open;
    launch.setAttribute("aria-expanded", String(open));
  }

  async function updateAvailability(version) {
    const availability = await RedactModel.availability();
    if (scanVersion === version) enable.hidden = !["downloadable", "downloading"].includes(availability);
  }

  function show(result, text, original) {
    review = { result, text, original };
    score.textContent = result.score + "/100 · " + Redact.rating(result.score);
    status.textContent = result.contextual ? "Rules + on-device AI · checked on this device" : "Rules check · checked on this device";
    reasons.replaceChildren();
    for (const reason of result.reasons) {
      const item = document.createElement("li");
      item.className = "row";
      const label = document.createElement("span");
      label.textContent = reason.label + (reason.contextual ? " · AI-assisted" : "");
      const points = document.createElement("span");
      points.textContent = "+" + reason.points;
      item.append(label, points);
      reasons.append(item);
    }
    const hasFindings = result.matches.length > 0;
    reasons.hidden = !hasFindings;
    suggestion.hidden = !hasFindings;
    replace.hidden = !hasFindings;
    replace.disabled = false;
    rewrite.textContent = hasFindings ? result.rewritten : "";
  }

  async function checkDraft() {
    const current = composer;
    const text = read(current);
    const version = ++scanVersion;
    setPanel(true);
    const earlier = userTurns().length;
    context.textContent = (earlier ? "Earlier messages from you visible in this chat: " + earlier + ". " : "") +
      "ChatGPT may also have uploads or memory. This check covers the draft text.";
    if (text.length > Redact.maxLength) {
      review = null;
      score.textContent = "Not scored";
      reasons.hidden = suggestion.hidden = replace.hidden = true;
      status.textContent = "This draft exceeds 20,000 characters. Shorten it before checking; it has not been fully scanned.";
      return;
    }
    if (!text.trim()) {
      review = null;
      score.textContent = "";
      reasons.hidden = suggestion.hidden = replace.hidden = true;
      rewrite.textContent = "";
      status.textContent = "Type a draft in ChatGPT, then check it here.";
      return;
    }
    show({ ...Redact.scan(text), contextual: false }, text, current);
    void updateAvailability(version);
    if (await RedactModel.availability() !== "available") return;
    if (version !== scanVersion || read(current) !== text || composer !== current) return;
    status.textContent = "Rules check ready · checking context on device…";
    const result = await RedactModel.check(text);
    if (version === scanVersion && composer === current && read(current) === text) show(result, text, current);
  }

  launch.addEventListener("click", () => {
    if (!panel.hidden) {
      setPanel(false);
      return;
    }
    void checkDraft();
  });
  root.querySelector(".close").addEventListener("click", () => {
    setPanel(false);
    launch.focus();
  });
  wrap.addEventListener("keydown", event => {
    if (event.key === "Escape" && !panel.hidden) {
      event.stopPropagation();
      setPanel(false);
      launch.focus();
    }
  });
  enable.addEventListener("click", async () => {
    enable.disabled = true;
    const previous = enable.textContent;
    enable.textContent = "Preparing model…";
    try {
      await RedactModel.enable(progress => { enable.textContent = "Downloading " + progress + "%"; });
      if (!panel.hidden) await checkDraft();
    } catch {
      status.textContent = "Contextual AI could not start. The rules check is ready.";
    } finally {
      enable.textContent = previous;
      enable.disabled = false;
    }
  });

  function applyRedaction(editor, result) {
    const replacement = result.rewritten;
    editor.focus();
    if (editor instanceof HTMLTextAreaElement) {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(editor, replacement);
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: replacement }));
    } else {
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("insertText", false, replacement);
    }
    if (normalize(read(editor)) !== normalize(replacement)) return false;
    appliedRedaction = { composer: editor, normalized: normalize(replacement), count: result.matches.length };
    return true;
  }

  replace.addEventListener("click", () => {
    if (!review || composer !== review.original || read(composer) !== review.text) {
      status.textContent = "The draft changed. Close and run a fresh check.";
      replace.disabled = true;
      return;
    }
    const replacement = review.result.rewritten;
    if (!applyRedaction(composer, review.result)) {
      status.textContent = "Could not update the composer. You can copy the suggested draft above.";
      return;
    }
    ++scanVersion;
    show({ ...Redact.scan(replacement), contextual: false }, replacement, composer);
    status.textContent = "Draft replaced. Review it in ChatGPT before sending.";
    launch.focus();
  });

  function clearStaged() {
    clearTimeout(expiry);
    staged = null;
  }

  function stage(result) {
    if (!composer?.isConnected) return;
    const text = read(composer);
    if (text.length > Redact.maxLength) return;
    const normalized = normalize(text);
    if (!normalized) return;
    const redactedCount = appliedRedaction?.composer === composer && appliedRedaction.normalized === normalized ? appliedRedaction.count : 0;
    if (!historyEnabled && !redactedCount) return;
    if (staged?.normalized === normalized && staged.composer === composer) return;
    clearStaged();
    for (const turn of userTurns()) seenTurns.add(turn);
    staged = {
      composer,
      normalized,
      redactedCount,
      kinds: (result || (review?.text === text && review.original === composer ? review.result : Redact.scan(text)))
        .reasons.map(reason => reason.kind),
    };
    expiry = setTimeout(clearStaged, 12_000);
  }

  function alert(message) {
    sendAlert.textContent = message;
    sendAlert.hidden = false;
    clearTimeout(alertTimer);
    alertTimer = setTimeout(() => { sendAlert.hidden = true; }, 6000);
  }

  function canSend(button) {
    return button?.isConnected && !button.disabled && button.getAttribute("aria-disabled") !== "true" &&
      (!button.dataset.sendLabel || button.getAttribute("aria-label") === button.dataset.sendLabel) &&
      (!button.form || button.form.contains(composer));
  }

  function sendButton() {
    return [...document.querySelectorAll(sendSelector)].find(canSend);
  }

  function handleSend(event, retry) {
    if (!composer?.isConnected || event.defaultPrevented || mode === "off") return;
    const text = read(composer);
    if (!text.trim()) return;
    const pause = () => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    if (pendingSend) {
      pause();
      return;
    }
    if (mode === "manual") {
      stage();
      return;
    }
    if (mode === null || text.length > Redact.maxLength) {
      pause();
      alert(mode === null ? "Redact settings are unavailable. Refresh ChatGPT and try again." :
        "Auto-redact paused this send. Shorten your draft to 20,000 characters or fewer.");
      return;
    }
    const result = Redact.scan(text);
    if (!result.matches.length) {
      stage(result);
      return;
    }

    pause();
    const editor = composer;
    if (editor.querySelector('a, img, video, audio, table, pre, code, strong, em, ol, ul, blockquote, [contenteditable="false"]')) {
      alert("Auto-redact paused this formatted draft. Open Check with Redact to review the suggested text.");
      return;
    }
    clearStaged();
    pendingSend = true;
    try {
      if (!applyRedaction(editor, result)) throw new Error("Composer did not accept the replacement.");
    } catch {
      pendingSend = false;
      alert("Redact paused this send. Check the draft and try again.");
      return;
    }
    ++scanVersion;
    review = null;
    setPanel(false);
    // Resume in a new event, after the editor has handled the replacement.
    setTimeout(() => {
      pendingSend = false;
      const updated = read(editor);
      if (mode !== "auto" || composer !== editor || !editor.isConnected || updated.length > Redact.maxLength ||
          normalize(updated) !== normalize(result.rewritten) || Redact.scan(updated).matches.length) {
        alert("Redact paused this send. Review the updated draft and try again.");
        return;
      }
      if (!retry()) alert("Draft redacted. Press Send to continue.");
    }, 0);
  }

  document.addEventListener("input", event => {
    if (appliedRedaction?.composer.contains(event.target) && normalize(read(composer)) !== appliedRedaction.normalized) {
      appliedRedaction = null;
    }
  }, true);

  document.addEventListener("click", event => {
    const button = event.target.closest?.(sendSelector);
    if (!canSend(button)) return;
    handleSend(event, () => {
      const control = canSend(button) ? button : sendButton();
      if (!control) return false;
      control.click();
      return true;
    });
  }, true);
  document.addEventListener("keydown", event => {
    if (mode === "off" || event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey ||
        event.isComposing || event.keyCode === 229 || !composer?.contains(event.target)) return;
    if (composer instanceof HTMLTextAreaElement || !sendButton() || composer.getAttribute("aria-expanded") === "true") {
      stage();
      return;
    }
    handleSend(event, () => {
      const control = sendButton();
      if (!control) return false;
      control.click();
      return true;
    });
  }, true);
  document.addEventListener("submit", event => {
    if (!event.target.contains?.(composer)) return;
    const form = event.target;
    handleSend(event, () => {
      if (!form.isConnected || !form.contains(composer)) return false;
      if (event.submitter && event.submitter.form !== form) return false;
      form.requestSubmit(event.submitter || undefined);
      return true;
    });
  }, true);

  function sync() {
    const current = draftComposer();
    if (current !== composer) {
      composer = current;
      review = null;
      appliedRedaction = null;
      ++scanVersion;
      setPanel(false);
    }
    if (composer) {
      const anchor = composer.closest('form, [data-composer-surface-variant="default"]') || composer.parentElement;
      if (anchor && anchor.previousElementSibling !== host) anchor.before(host);
    } else {
      host.remove();
    }
    // A send attempt only becomes a history entry when a matching user turn appears.
    if (!staged) return;
    for (const turn of userTurns()) {
      if (seenTurns.has(turn)) continue;
      const content = turn.querySelector(".whitespace-pre-wrap, [data-message-content]") || turn;
      const normalized = normalize(read(content));
      if (!normalized) continue;
      seenTurns.add(turn);
      if (normalized !== staged.normalized) continue;
      const { kinds, redactedCount } = staged;
      clearStaged();
      review = null;
      ++scanVersion;
      setPanel(false);
      appliedRedaction = null;
      if (redactedCount) {
        alert("Redacted message sent · " + redactedCount + (redactedCount === 1 ? " private detail replaced" : " private details replaced"));
      }
      if (historyEnabled || redactedCount) void chrome.runtime.sendMessage({ type: "REDACT_LOG", kinds, redactedCount }).catch(() => {});
      break;
    }
  }

  sync();
  new MutationObserver(sync).observe(document.body, { subtree: true, childList: true, characterData: true });

  function setMode(value) {
    mode = value;
    autoState.textContent = { off: "Off", manual: "Manual", auto: "Auto on" }[value];
    launch.disabled = value === "off";
    launch.setAttribute("aria-label", value === "off" ? "Redact is off" : "Check with Redact. " + autoState.textContent);
    if (value === "off") {
      ++scanVersion;
      review = appliedRedaction = null;
      clearStaged();
      setPanel(false);
      sendAlert.hidden = true;
    }
  }

  let historyChanged = false;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.mode && ["off", "manual", "auto"].includes(changes.mode.newValue)) setMode(changes.mode.newValue);
    if (changes.enabled) {
      historyChanged = true;
      historyEnabled = changes.enabled.newValue === true;
      if (!historyEnabled && !staged?.redactedCount) clearStaged();
    }
  });
  void chrome.runtime.sendMessage({ type: "REDACT_PREFERENCES" }).then(result => {
    if (!historyChanged) historyEnabled = result?.enabled === true;
    if (mode === null && ["off", "manual", "auto"].includes(result?.mode)) setMode(result.mode);
    if (mode === null) autoState.textContent = "Unavailable";
  }).catch(() => {
    if (mode === null) autoState.textContent = "Unavailable";
  });
})();
