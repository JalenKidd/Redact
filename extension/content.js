(() => {
  const host = document.createElement("div");
  host.id = "redact-assistant";
  const root = host.attachShadow({ mode: "closed" });
  // Bundled CSS lives in the isolated shadow tree.
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; display: flex; justify-content: flex-end; margin: 5px 0; color-scheme: light; }
    * { box-sizing: border-box; }
    .wrap { position: relative; font: 13px/1.45 system-ui, sans-serif; color: #201b2f; }
    button { font: inherit; cursor: pointer; }
    button:focus-visible { outline: 2px solid #6849c6; outline-offset: 3px; }
    button:disabled { opacity: .55; cursor: default; }
    .launch { border: 1px solid #bda6ff; border-radius: 999px; background: #201b2f; color: #f4eeff; padding: 6px 12px; display: flex; align-items: center; gap: 7px; font-weight: 650; }
    .mark { color: #d6f779; font-size: 14px; line-height: 1; }
    .panel { position: absolute; right: 0; bottom: calc(100% + 10px); z-index: 2147483647; width: min(360px, 86vw); max-height: min(460px, 57vh); overflow: auto; border: 1px solid #d9d0ee; border-radius: 16px; padding: 16px; background: #fbf9ff; box-shadow: 0 16px 52px #1c122c44; }
    [hidden] { display: none !important; }
    .top, .row, .actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .eyebrow { color: #6345a1; font: 700 10px/1.5 ui-monospace, monospace; letter-spacing: .12em; }
    .close { border: 0; background: transparent; font-size: 22px; line-height: 1; color: #49385b; }
    .score { margin: 7px 0; font-size: 21px; letter-spacing: -.04em; font-weight: 750; }
    .reasons { margin: 6px 0 12px; padding: 0; list-style: none; }
    .row { padding: 5px 0; border-bottom: 1px solid #e8dff4; }
    .row span:last-child { color: #6345a1; font-family: ui-monospace, monospace; }
    .rewrite { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 135px; overflow: auto; background: #efe9f9; border: 1px solid #e8dff4; border-radius: 8px; padding: 8px; margin: 4px 0 10px; }
    .main { border: 0; background: #d6f779; color: #1f2022; padding: 7px 10px; border-radius: 8px; font-weight: 750; }
    .quiet { border: 0; color: #6547a8; background: transparent; padding: 5px 0; text-align: left; }
    .status { color: #574d67; margin: 5px 0 9px; }
  `;
  const wrap = document.createElement("div");
  wrap.className = "wrap";
  wrap.innerHTML = `
    <button type="button" class="launch" aria-expanded="false" aria-controls="redact-panel"><span class="mark" aria-hidden="true">▰</span> Check with Redact</button>
    <section class="panel" id="redact-panel" aria-label="Redact exposure check" hidden>
      <div class="top"><span class="eyebrow">REDACT / DRAFT CHECK</span><button class="close" type="button" aria-label="Close draft check">×</button></div>
      <div class="score" aria-live="polite"></div>
      <div class="status" role="status"></div>
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

  const turnSelector = '[data-message-author-role="user"]';
  const seenTurns = new WeakSet();
  let composer = null;
  let review = null;
  let scanVersion = 0;
  let historyEnabled = false;
  let staged = null;
  let expiry;

  function read(element) {
    return element instanceof HTMLTextAreaElement ? element.value : element?.innerText || "";
  }

  function normalize(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function draftComposer() {
    return document.querySelector('#prompt-textarea, textarea[data-testid="prompt-textarea"], [contenteditable="true"][data-testid="prompt-textarea"]');
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

  replace.addEventListener("click", () => {
    if (!review || composer !== review.original || read(composer) !== review.text) {
      status.textContent = "The draft changed. Close and run a fresh check.";
      replace.disabled = true;
      return;
    }
    const replacement = review.result.rewritten;
    composer.focus();
    if (composer instanceof HTMLTextAreaElement) {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(composer, replacement);
      composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: replacement }));
    } else {
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(composer);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("insertText", false, replacement);
    }
    if (normalize(read(composer)) !== normalize(replacement)) {
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

  function stage() {
    if (!historyEnabled || !composer?.isConnected) return;
    const text = read(composer);
    if (text.length > Redact.maxLength) return;
    const normalized = normalize(text);
    if (!normalized) return;
    if (staged?.normalized === normalized && staged.composer === composer) return;
    clearStaged();
    for (const turn of document.querySelectorAll(turnSelector)) seenTurns.add(turn);
    staged = {
      composer,
      normalized,
      kinds: (review?.text === text && review.original === composer ? review.result : Redact.scan(text))
        .reasons.map(reason => reason.kind),
    };
    expiry = setTimeout(clearStaged, 12_000);
  }

  document.addEventListener("click", event => {
    const button = event.target.closest?.('button[data-testid="send-button"], button#composer-submit-button[aria-label="Send prompt"]');
    if (button && !button.disabled) stage();
  }, true);
  document.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey &&
        !event.metaKey && !event.isComposing && !event.defaultPrevented && composer?.contains(event.target)) stage();
  }, true);
  document.addEventListener("submit", event => {
    if (event.target.contains?.(composer)) stage();
  }, true);

  function sync() {
    const current = draftComposer();
    if (current !== composer) {
      composer = current;
      review = null;
      ++scanVersion;
      setPanel(false);
    }
    if (composer) {
      const anchor = composer.closest("form") || composer.parentElement;
      if (anchor && anchor.previousElementSibling !== host) anchor.before(host);
    } else {
      host.remove();
    }
    // A send attempt only becomes a history entry when a matching user turn appears.
    if (!staged) return;
    for (const turn of document.querySelectorAll(turnSelector)) {
      if (seenTurns.has(turn)) continue;
      const content = turn.querySelector(".whitespace-pre-wrap, [data-message-content]") || turn;
      const normalized = normalize(read(content));
      if (!normalized) continue;
      seenTurns.add(turn);
      if (normalized !== staged.normalized) continue;
      const { kinds } = staged;
      clearStaged();
      review = null;
      ++scanVersion;
      setPanel(false);
      void chrome.runtime.sendMessage({ type: "REDACT_LOG", kinds }).catch(() => {});
      break;
    }
  }

  sync();
  new MutationObserver(sync).observe(document.body, { subtree: true, childList: true, characterData: true });

  let settingsChanged = false;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.enabled) {
      settingsChanged = true;
      historyEnabled = changes.enabled.newValue === true;
      if (!historyEnabled) clearStaged();
    }
  });
  void chrome.runtime.sendMessage({ type: "REDACT_PREFERENCES" }).then(result => {
    if (!settingsChanged) historyEnabled = result?.enabled === true;
  }).catch(() => {});
})();
