const $ = id => document.getElementById(id);
const prompt = $("prompt");
const modal = $("modal");
const toast = $("toast");
const number = new Intl.NumberFormat();
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const desktop = globalThis.redactDesktop;
const motion = RedactMotion;

const routeNames = { scan: "Prompt scanner", history: "Exposure history", policies: "Privacy guide" };
const placeholder = {
  rating: "Ready when you are",
  description: "Check your draft to see what it could reveal.",
};
const tone = score => score >= 50 ? "high" : score >= 25 ? "moderate" : score > 0 ? "low" : "clear";

let activeRoute = "scan";
let demo = null;
let draftBeforeDemo = "";
let checkVersion = 0;
let historyVersion = 0;
let lastReview = null;
let liveHistory = { state: "idle", enabled: false, summaries: [] };
let toastTimer;

function node(tag, className, value) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (value !== undefined) item.textContent = value;
  return item;
}

function button(label, style, onClick) {
  const item = node("button", style, label);
  item.type = "button";
  item.addEventListener("click", onClick);
  return item;
}

function link(label, url, style) {
  const item = node("a", style, label);
  item.href = url;
  item.target = "_blank";
  item.rel = "noopener noreferrer";
  return item;
}

function notify(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3400);
}

async function copy(value, success) {
  try {
    if (desktop) await desktop.copyText(value);
    else await navigator.clipboard.writeText(value);
    notify(success);
  } catch {
    notify("Copy was unavailable. Select the text and copy it manually.");
  }
}

function openDialog(label, heading, ...content) {
  $("modal-label").textContent = label;
  const title = node("h2", null, heading);
  title.id = "dialog-heading";
  modal.setAttribute("aria-labelledby", title.id);
  $("modal-content").replaceChildren(title, ...content);
  if (!modal.open) modal.showModal();
}

function updateDemo(message) {
  if (!demo) return;
  demo.instructions[activeRoute] = message;
  $("demo-instruction").textContent = message;
}

function emptyFinding(symbol, text) {
  const container = node("div", "empty-finding");
  const icon = node("span", null, symbol);
  icon.setAttribute("aria-hidden", "true");
  container.append(icon, node("p", null, text));
  return container;
}

function resetReview({ keepScore = false } = {}) {
  lastReview = null;
  ++checkVersion;
  $("check-prompt").disabled = false;
  if (!keepScore) motion.resetScore();
  $("score-rating").textContent = placeholder.rating;
  $("score-rating").className = "score-badge";
  $("score-description").textContent = placeholder.description;
  $("finding-count").textContent = "AWAITING CHECK";
  $("findings").replaceChildren(emptyFinding("⌕", "Every point comes with a reason. You decide what to change."));
  $("rewrite-card").hidden = true;
  $("highlighted").replaceChildren();
  $("rewritten").textContent = "";
  $("save-check").hidden = true;
}

function updateCount() {
  $("char-count").textContent = number.format(prompt.value.length) + " / 20,000 characters";
}

function setDraft(text, label, keepScore = false) {
  prompt.value = text;
  $("draft-label").textContent = label;
  updateCount();
  resetReview({ keepScore });
}

function showResult(text, result, { replaced = false, pending = false } = {}) {
  lastReview = { text, result };
  $("save-check").hidden = !desktop || !!demo || pending;
  $("save-check").disabled = false;
  $("save-check").textContent = "Save check";
  $("replace-draft").disabled = pending;
  const tag = tone(result.score);
  motion.score(result.score);
  $("score-ring").style.setProperty("--score-color", { high: "#d38c69", moderate: "#d4a96a", low: "#8ba969", clear: "#a3b884" }[tag]);
  $("score-rating").textContent = Redact.rating(result.score);
  $("score-rating").className = "score-badge " + tag;
  $("score-description").textContent = replaced ? "Draft replaced. Review it before sharing." :
    pending ? "Rules check ready. Checking context on this device…" :
      result.contextual ? "Checked with rules and on-device AI." : "Checked with rules on this device.";
  $("finding-count").textContent = result.reasons.length + (result.reasons.length === 1 ? " CATEGORY" : " CATEGORIES");
  $("findings").replaceChildren();
  if (!result.reasons.length) $("findings").append(emptyFinding("✓", "Review your draft for anything you still want to keep private."));
  for (const reason of result.reasons) {
    const row = node("div", "finding");
    const label = node("div", "finding-label", reason.label);
    label.append(node("small", null, (reason.contextual ? "AI-assisted" : "Rule match") + " · " + reason.count + (reason.count === 1 ? " occurrence" : " occurrences")));
    row.append(node("span", "finding-dot"), label, node("span", "finding-points", "+" + reason.points));
    $("findings").append(row);
  }
  motion.findings();

  const hasFindings = result.matches.length > 0;
  const revealRewrite = $("rewrite-card").hidden && hasFindings;
  $("rewrite-card").hidden = !hasFindings;
  $("highlighted").replaceChildren();
  $("rewritten").textContent = hasFindings ? result.rewritten : "";
  if (hasFindings) {
    let offset = 0;
    for (const match of result.matches) {
      $("highlighted").append(document.createTextNode(text.slice(offset, match.start)));
      const mark = node("mark", null, text.slice(match.start, match.end));
      mark.title = Redact.categories[match.kind].label;
      $("highlighted").append(mark);
      offset = match.end;
    }
    $("highlighted").append(document.createTextNode(text.slice(offset)));
  }
  if (revealRewrite) motion.reveal($("rewrite-card"));
  if (!pending) $("announcement").textContent = result.score + " out of 100. " + Redact.rating(result.score) + ".";
}

async function runCheck() {
  const text = prompt.value;
  if (!text.trim()) {
    prompt.focus();
    notify("Add a draft to check.");
    return;
  }

  const version = ++checkVersion;
  motion.scan();
  const rules = Redact.scan(text);
  showResult(text, rules);
  if (demo) {
    updateDemo(rules.matches.length ? "02 / Review the flagged details, then choose Replace draft." :
      "03 / Your practice draft is ready. Simulate a send to see its exposure summary.");
    $("demo-send").hidden = !!rules.matches.length;
  } else if (await RedactModel.availability() === "available" && version === checkVersion) {
    $("check-prompt").disabled = true;
    showResult(text, rules, { pending: true });
    const result = await RedactModel.check(text);
    if (version === checkVersion) {
      showResult(text, result);
      $("check-prompt").disabled = false;
    }
  }
  if (version === checkVersion && lastReview?.result.matches.length) {
    $("rewrite-card").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

async function replaceDraft() {
  if (!lastReview || lastReview.text !== prompt.value) return;
  const review = lastReview;
  $("replace-draft").disabled = true;
  await motion.redact($("highlighted"));
  $("replace-draft").disabled = false;
  if (review !== lastReview || review.text !== prompt.value) return;
  const before = lastReview.result.score;
  const text = lastReview.result.rewritten;
  const result = Redact.scan(text);
  setDraft(text, demo ? "FICTIONAL REWRITE" : "REVISED DRAFT", true);
  showResult(text, result, { replaced: true });
  if (demo) {
    updateDemo("03 / Exposure dropped from " + before + " to " + result.score + ". Simulate a send to see the summary.");
    $("demo-send").hidden = false;
    motion.reveal($("demo-send"));
    $("simulate-send").focus({ preventScroll: true });
    $("demo-send").scrollIntoView({ behavior: "smooth", block: "nearest" });
  } else if (activeRoute === "scan") {
    prompt.focus({ preventScroll: true });
    $("draft-heading").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  notify("Draft replaced. Your original request is still there.");
}

function seedHistory() {
  const day = 86_400_000;
  const now = Date.now();
  return [
    { provider: "ChatGPT", timestamp: now - day, score: 75, kinds: ["government", "phone"] },
    { provider: "ChatGPT", timestamp: now - day * 2, score: 50, kinds: ["phone", "student"] },
    { provider: "ChatGPT", timestamp: now - day * 3, score: 20, kinds: ["email"] },
  ];
}

function startDemo() {
  if (!demo) draftBeforeDemo = prompt.value;
  demo = { summaries: seedHistory(), instructions: {
    scan: "01 / Check this fictional draft before sharing it with AI.",
    history: "See how fictional prompts rank by exposure score.",
    policies: "05 / Show how training and deletion are handled separately.",
  } };
  document.body.classList.add("rehearsing");
  $("demo-banner").hidden = false;
  $("demo-send").hidden = true;
  $("start-demo").firstChild.textContent = "Restart demo ";
  setDraft(Redact.sample, "FICTIONAL EXAMPLE");
  navigate("scan");
}

function endDemo() {
  demo = null;
  document.body.classList.remove("rehearsing");
  $("demo-banner").hidden = true;
  $("demo-send").hidden = true;
  $("start-demo").firstChild.textContent = "Run the demo ";
  setDraft(draftBeforeDemo, "READY TO CHECK");
  draftBeforeDemo = "";
  if (activeRoute === "history") void refreshHistory();
  notify("Demo ended. Your private workspace is ready.");
}

function simulateSend() {
  if (!demo || !prompt.value.trim()) return;
  const result = Redact.scan(prompt.value);
  demo.summaries.unshift({
    provider: "ChatGPT",
    timestamp: Date.now(),
    score: result.score,
    kinds: result.reasons.map(reason => reason.kind),
  });
  $("demo-send").hidden = true;
  demo.instructions.history = "04 / Compare the new " + result.score + "-point summary with earlier fictional prompts. Then open Privacy guide.";
  $("history-filter").value = "all";
  $("history-sort").value = "score";
  navigate("history");
  notify("Fictional summary added to rehearsal history.");
}

function parseSummaries(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(entry => entry && ["ChatGPT", "Manual check"].includes(entry.provider) &&
    Number.isFinite(entry.timestamp) && Number.isFinite(entry.score) &&
    Math.abs(entry.timestamp) <= 8.64e15 && entry.score >= 0 && entry.score <= 100 && Array.isArray(entry.kinds)).slice(0, 200);
}

function readExtensionHistory() {
  if (desktop) return desktop.getHistory().catch(() => null);
  return new Promise(resolve => {
    const runtime = globalThis.chrome?.runtime;
    if (!runtime?.sendMessage) {
      resolve(null);
      return;
    }
    const timeout = setTimeout(() => resolve(null), 2000);
    try {
      runtime.sendMessage(RedactConfig.extensionId, { type: "REDACT_HISTORY" }, reply => {
        clearTimeout(timeout);
        resolve(runtime.lastError || reply?.error ? null : reply);
      });
    } catch {
      clearTimeout(timeout);
      resolve(null);
    }
  });
}

async function refreshHistory() {
  const version = ++historyVersion;
  if (demo) {
    renderHistory();
    return;
  }
  if (liveHistory.state === "idle") {
    liveHistory.state = "loading";
    renderHistory();
  }
  const response = await readExtensionHistory();
  if (version !== historyVersion || demo) return;
  liveHistory = response ? { state: "connected", enabled: response.enabled === true, summaries: parseSummaries(response.summaries) } :
    { state: "disconnected", enabled: false, summaries: [] };
  if (activeRoute === "history") renderHistory();
}

function stat(label, value, description) {
  const item = node("div", "stat");
  item.append(node("span", "stat-label", label), node("strong", "stat-value", value), node("span", "stat-description", description));
  return item;
}

function renderHistory() {
  const summaries = demo ? demo.summaries : liveHistory.summaries;
  const source = $("history-source");
  const content = $("history-content");
  source.replaceChildren();
  content.replaceChildren();

  if (demo) {
    source.append(node("strong", null, "Rehearsal history"), node("span", null, "Fictional summaries · kept separate from your browser history"));
  } else if (desktop && liveHistory.state === "connected") {
    source.append(node("strong", null, "Desktop history"), node("span", null, "Manual checks on this device · saving " + (liveHistory.enabled ? "enabled" : "off")));
  } else if (desktop) {
    source.append(node("strong", null, liveHistory.state === "loading" ? "Loading desktop history…" : "Desktop history is unavailable. Try refreshing."));
  } else if (liveHistory.state === "connected") {
    source.append(node("strong", null, "Chrome extension connected"), node("span", null, "Local browser history · recording " + (liveHistory.enabled ? "on" : "off")));
  } else if (liveHistory.state === "loading") {
    source.append(node("strong", null, "Looking for the Redact extension…"));
  } else {
    source.append(node("span", null, "Connect Redact in Chrome to see your local exposure history."), button("Get the extension ↗", "text-button", showInstall));
  }
  const highest = summaries.length ? Math.max(...summaries.map(summary => summary.score)) : "—";
  $("history-stats").replaceChildren(
    stat(desktop && !demo ? "CHECKS SAVED" : "PROMPTS RECORDED", summaries.length, "Summaries in this view"),
    stat("HIGH EXPOSURE", summaries.filter(summary => summary.score >= 50).length, "Score of 50 or above"),
    stat("PEAK SCORE", highest, "Highest recorded exposure"),
  );

  const filter = $("history-filter").value;
  const sort = $("history-sort").value;
  const visible = summaries.filter(summary => filter === "all" || (filter === "high") === (summary.score >= 50));
  visible.sort((first, second) => (sort === "score" ? second.score - first.score : 0) || second.timestamp - first.timestamp);
  if (!visible.length) {
    const empty = node("div", "history-empty");
    const filtered = summaries.length > 0;
    empty.append(node("span", "empty-symbol", "◷"), node("h3", null, filtered ? "No matching summaries" : "Your history is empty."));
    const text = filtered ? "Choose a different exposure filter to see more summaries." :
      desktop ? "Enable desktop history, check a draft, then choose Save check. Each entry is a manual check summary." :
      liveHistory.state === "connected" ? "Enable history in the extension, then send a prompt in ChatGPT to see its exposure summary here." :
        "Install Redact and opt into history, or run the guided demo to see how it looks.";
    empty.append(node("p", null, text));
    if (!filtered && desktop && !demo) {
      empty.append(button("History settings", "secondary-button", () => void showDesktopSettings()));
    } else if (!filtered && liveHistory.state !== "connected" && liveHistory.state !== "loading") {
      empty.append(button("Run the demo ↗", "secondary-button", startDemo));
    }
    content.append(empty);
    return;
  }

  const table = node("table", "history-table");
  const header = node("tr");
  for (const label of [desktop && !demo ? "SOURCE" : "PROVIDER", "EXPOSURE", "REASONS", desktop && !demo ? "CHECKED" : "SUBMITTED"]) {
    const cell = node("th", null, label);
    cell.scope = "col";
    header.append(cell);
  }
  const head = node("thead");
  head.append(header);
  const body = node("tbody");
  for (const summary of visible) {
    const row = node("tr");
    const provider = node("td");
    const icon = node("span", "provider-mark", summary.provider === "Manual check" ? "⌕" : "✳");
    icon.setAttribute("aria-hidden", "true");
    provider.append(icon, document.createTextNode(summary.provider));
    const scoreCell = node("td");
    const score = node("div", "history-score");
    score.append(node("b", null, summary.score), node("span", "score-badge " + tone(summary.score), Redact.rating(summary.score)));
    scoreCell.append(score);
    const reasons = node("td");
    for (const kind of summary.kinds) {
      if (Object.hasOwn(Redact.categories, kind)) reasons.append(node("span", "reason-chip", Redact.categories[kind].label));
    }
    if (!reasons.children.length) reasons.append(node("span", "reason-chip", "No signals found"));
    const timeCell = node("td");
    const date = new Date(summary.timestamp);
    const time = node("time", null, dateFormat.format(date));
    time.dateTime = date.toISOString();
    timeCell.append(time);
    row.append(provider, scoreCell, reasons, timeCell);
    body.append(row);
  }
  table.append(head, body);
  content.append(table);
}

function showInstall() {
  const instructions = node("ol");
  const first = node("li", null, "Download the extension and unzip it. You can also use ");
  first.append(node("code", null, "build/extension"), document.createTextNode(" from the project."));
  const second = node("li", null, "In Chrome, open ");
  second.append(node("code", null, "chrome://extensions"), document.createTextNode(" and enable Developer mode."));
  instructions.append(first, second, node("li", null, "Choose Load unpacked and select the unzipped folder. Refresh ChatGPT and look for Check with Redact."));
  const actions = node("div", "dialog-actions");
  const download = node("a", "primary-button", "Download extension ↓");
  download.href = "redact-extension.zip";
  download.download = "redact-extension.zip";
  actions.append(download, link("Open ChatGPT ↗", "https://chatgpt.com/", "secondary-button"));
  openDialog("DESKTOP CHROME / SETUP", "Add Redact to Chrome.", instructions, actions);
}

async function showDesktopSettings() {
  if (!desktop) return;
  const loading = node("p", null, "Loading your local preferences…");
  openDialog("REDACT / DESKTOP", "Your history, on this device.", loading);
  let state;
  try {
    state = await desktop.getHistory();
  } catch {
    loading.textContent = "Could not load desktop history. Try again.";
    return;
  }
  const label = node("label", "desktop-history-toggle", "Allow saving manual checks");
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = state.enabled;
  label.append(toggle);
  toggle.addEventListener("change", async () => {
    toggle.disabled = true;
    try {
      await desktop.setHistoryEnabled(toggle.checked);
      await refreshHistory();
      notify(toggle.checked ? "You can now save manual check summaries." : "Saving is off. Existing summaries are still available.");
    } catch {
      toggle.checked = !toggle.checked;
      notify("Could not save the history preference.");
    } finally {
      toggle.disabled = false;
    }
  });
  const clear = button("Clear desktop history", "secondary-button", () => {
    const actions = node("div", "dialog-actions");
    actions.append(button("Cancel", "secondary-button", () => void showDesktopSettings()), button("Clear history", "primary-button", async () => {
      try {
        await desktop.clearHistory();
        await refreshHistory();
        modal.close();
        notify("Desktop history cleared.");
      } catch {
        notify("Could not clear desktop history.");
      }
    }));
    openDialog("REDACT / DESKTOP", "Clear desktop history?", node("p", null, "This removes the saved check summaries on this device."), actions);
  });
  clear.disabled = !state.summaries.length;
  const actions = node("div", "dialog-actions");
  actions.append(clear);
  openDialog("REDACT / DESKTOP", "Your history, on this device.", label,
    node("p", null, "Save check stores the date, score, and category labels for a manual check. Your draft stays in the app window."), actions);
}

async function saveDesktopCheck() {
  if (!desktop || demo || !lastReview || lastReview.text !== prompt.value) return;
  const review = lastReview;
  const save = $("save-check");
  save.disabled = true;
  try {
    const state = await desktop.getHistory();
    if (!state.enabled) {
      await showDesktopSettings();
      return;
    }
    await desktop.saveSummary(review.result.reasons.map(reason => reason.kind));
    if (review === lastReview) {
      save.textContent = "Saved ✓";
      save.disabled = true;
    }
    notify("Manual check summary saved on this device.");
  } catch {
    notify("Could not save this check summary.");
  } finally {
    if (review === lastReview && save.textContent !== "Saved ✓") save.disabled = false;
  }
}

function showScoring() {
  const table = node("table", "scoring-table");
  table.setAttribute("aria-label", "Points by category");
  const body = node("tbody");
  for (const { label, points } of Object.values(Redact.categories)) {
    const row = node("tr");
    row.append(node("td", null, label), node("td", null, "+" + points));
    body.append(row);
  }
  table.append(body);
  openDialog("REDACT / SCORING", "Every point has a reason.",
    node("p", null, "Each detected category counts once. Redact adds the fixed weights below and caps the total at 100. A score of 0 means the check found no signals."), table);
}

function showPolicyAction(policy, action) {
  const data = policy[action];
  const actions = node("div", "dialog-actions");
  const description = node("p", null, data.description);
  const heading = action === "optOut" ? "Turn off training" : "Delete data";
  if (action === "optOut") {
    const steps = node("ol");
    for (const step of data.steps) steps.append(node("li", null, step));
    actions.append(link(data.link, data.url, "primary-button"));
    openDialog(policy.name.toUpperCase() + " / PRIVACY CONTROLS", heading, description, steps, actions);
  } else {
    const draft = "Hello " + policy.company + " Privacy Team,\n\nI’d like to request deletion of personal data associated with my account [account email]. Please let me know the verification steps and which data can be deleted.\n\nThank you.";
    const request = node("div", "request-text", draft);
    actions.append(link(data.link, data.url, "primary-button"), button("Copy request draft", "secondary-button", () => void copy(draft, "Request draft copied.")));
    openDialog(policy.name.toUpperCase() + " / PRIVACY CONTROLS", heading, description,
      node("p", null, "Optional request draft. Review it, replace the placeholder, and submit it through the provider’s process."), request, actions);
  }
}

function renderPolicies() {
  for (const policy of RedactPolicies) {
    const card = node("article", "card policy-card");
    const provider = node("div", "provider-title");
    const avatar = node("span", "provider-avatar " + policy.id, policy.icon);
    avatar.setAttribute("aria-hidden", "true");
    const name = node("div");
    name.append(node("div", "tiny-label", policy.company), node("h2", null, policy.name));
    provider.append(avatar, name);
    card.append(provider);
    for (const [question, answer] of [
      ["What can it collect?", policy.collects],
      ["Can it use my chats for training?", policy.training],
      ["What can I change?", policy.controls],
    ]) {
      const section = node("section", "policy-question");
      section.append(node("h3", null, question), node("p", null, answer));
      card.append(section);
    }
    const controls = node("div", "policy-buttons");
    controls.append(button("Turn off training ↗", "primary-button", () => showPolicyAction(policy, "optOut")),
      button("Delete data ↗", "secondary-button", () => showPolicyAction(policy, "remove")));
    const sources = node("div", "policy-links");
    for (const source of policy.sources) sources.append(link(source.label + " ↗", source.url));
    const checked = node("div", "tiny-label source-date", "LAST CHECKED " + policy.checked.toUpperCase());
    card.append(controls, sources, checked);
    $("policy-cards").append(card);
  }
}

async function showAi() {
  const info = node("p", null, "Checking this browser’s on-device model…");
  const actions = node("div", "dialog-actions");
  openDialog("REDACT / CHECK ENGINE", "Contextual AI", info, actions);
  const availability = await RedactModel.availability();
  if (availability === "available") {
    info.textContent = "The on-device model is ready. When you check a draft, Redact can use it to look for context such as a street address or full name.";
    return;
  }
  if (availability === "unavailable") {
    info.textContent = desktop ? "The desktop app uses the local rules scanner. Contextual AI is available through Chrome’s Prompt API on compatible devices." :
      "This browser or device is using the rules scanner. Chrome’s Prompt API needs compatible desktop hardware and a local model download.";
    actions.append(link("Chrome requirements ↗", "https://developer.chrome.com/docs/ai/get-started#hardware", "secondary-button"));
    return;
  }
  info.textContent = "Chrome can download a model to look for contextual details on this device.";
  const enable = button("Prepare model", "primary-button", async () => {
    enable.disabled = true;
    info.textContent = "Preparing Chrome’s local model…";
    try {
      await RedactModel.enable(progress => { info.textContent = "Downloading Chrome’s local model · " + progress + "%"; });
      info.textContent = "On-device AI is ready for your next draft check.";
      enable.hidden = true;
      $("engine-status").lastChild.textContent = " Rules + contextual AI ready";
    } catch {
      info.textContent = "The model could not start. The rules scanner is ready.";
    } finally {
      enable.disabled = false;
    }
  });
  actions.append(enable);
}

let welcomeLeaving = false;

function showWelcome() {
  $("welcome-screen").hidden = false;
  $("workspace").inert = true;
  document.body.classList.add("welcome-open");
  $("enter-workspace").focus({ preventScroll: true });
}

async function enterWorkspace(tour = false) {
  if (welcomeLeaving) return;
  welcomeLeaving = true;
  try { localStorage.setItem("redact.welcomeSeen.v1", "true"); } catch {}
  const welcome = $("welcome-screen");
  const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 380;
  await welcome.animate([
    { opacity: 1, transform: "scale(1)", filter: "blur(0)" },
    { opacity: 0, transform: "scale(1.025)", filter: "blur(3px)" },
  ], { duration, easing: "cubic-bezier(.22, 1, .36, 1)" }).finished.catch(() => {});
  welcome.hidden = true;
  $("workspace").inert = false;
  document.body.classList.remove("welcome-open");
  welcomeLeaving = false;
  if (tour) startDemo();
  else motion.page($(activeRoute + "-page"));
  if (tour) $("check-prompt").focus({ preventScroll: true });
  else prompt.focus({ preventScroll: true });
}

function routeFromHash() {
  const hash = location.hash.slice(1);
  return Object.hasOwn(routeNames, hash) ? hash : "scan";
}

function renderRoute(route) {
  const previous = activeRoute;
  activeRoute = route;
  for (const key of Object.keys(routeNames)) {
    $(key + "-page").hidden = key !== route;
    const tab = document.querySelector('[data-route="' + key + '"]');
    tab.classList.toggle("active", key === route);
    if (key === route) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
  $("breadcrumb").textContent = routeNames[route];
  if (previous !== route) {
    const order = Object.keys(routeNames);
    motion.page($(route + "-page"), order.indexOf(route) > order.indexOf(previous) ? 1 : -1);
  }
  if (demo) $("demo-instruction").textContent = demo.instructions[route];
  if (route === "history") {
    renderHistory();
    void refreshHistory();
  }
}

function navigate(route) {
  if (routeFromHash() !== route) location.hash = route;
  else renderRoute(route);
  window.scrollTo(0, 0);
}

$("enter-workspace").addEventListener("click", () => void enterWorkspace());
$("welcome-demo").addEventListener("click", () => void enterWorkspace(true));
$("replay-welcome").addEventListener("click", showWelcome);
$("welcome-screen").addEventListener("keydown", event => {
  if (event.key === "Escape") {
    event.preventDefault();
    void enterWorkspace();
  }
  if (event.key !== "Tab") return;
  const first = $("enter-workspace");
  const last = $("welcome-demo");
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
$("start-demo").addEventListener("click", startDemo);
$("end-demo").addEventListener("click", endDemo);
$("simulate-send").addEventListener("click", simulateSend);
$("load-example").addEventListener("click", () => {
  setDraft(Redact.sample, "FICTIONAL EXAMPLE");
  $("demo-send").hidden = true;
  if (demo) updateDemo("01 / Check this fictional draft before sharing it with AI.");
  prompt.focus();
});
$("clear-draft").addEventListener("click", () => {
  setDraft("", "READY TO CHECK");
  $("demo-send").hidden = true;
  prompt.focus();
});
prompt.addEventListener("input", () => {
  updateCount();
  resetReview();
  $("draft-label").textContent = demo ? "REHEARSAL DRAFT" : "READY TO CHECK";
  $("demo-send").hidden = true;
});
$("check-prompt").addEventListener("click", () => void runCheck());
$("copy-rewrite").addEventListener("click", () => {
  if (lastReview) void copy(lastReview.result.rewritten, "Rewrite copied.");
});
$("replace-draft").addEventListener("click", replaceDraft);
$("scoring-info").addEventListener("click", showScoring);
$("enable-ai").addEventListener("click", () => void showAi());
$("install").addEventListener("click", showInstall);
$("save-check").addEventListener("click", () => void saveDesktopCheck());
$("desktop-history-settings").addEventListener("click", () => void showDesktopSettings());
$("modal-close").addEventListener("click", () => modal.close());
$("refresh-history").addEventListener("click", async () => {
  await refreshHistory();
  notify(demo ? "Rehearsal history refreshed." : liveHistory.state === "connected" ? "Local history refreshed." :
    desktop ? "Desktop history could not load." : "Redact extension is not connected.");
});
$("history-sort").addEventListener("change", renderHistory);
$("history-filter").addEventListener("change", renderHistory);
window.addEventListener("hashchange", () => {
  if (location.hash === "#main") return;
  renderRoute(routeFromHash());
  window.scrollTo(0, 0);
});
window.addEventListener("focus", () => {
  if (activeRoute === "history" && !demo) void refreshHistory();
});

renderPolicies();
if (desktop) {
  document.body.classList.add("desktop-app");
  if (desktop.platform === "darwin") document.body.classList.add("desktop-mac");
  document.querySelector(".local-note").lastChild.textContent = " This check runs on your device. Your draft stays in this window.";
  $("history-description").textContent = "Manual check summaries are stored on this device. Choose what to save after each check.";
  $("desktop-history-settings").hidden = false;
  $("history-page").querySelector(".page-heading p").textContent = "Review the drafts you chose to check. Start with the highest exposure.";
}
$("workspace").hidden = false;
if (location.hash === "#demo") startDemo();
else {
  renderRoute(routeFromHash());
  let seenWelcome = false;
  try { seenWelcome = localStorage.getItem("redact.welcomeSeen.v1") === "true"; } catch {}
  if (!seenWelcome && ["", "#scan"].includes(location.hash)) showWelcome();
}
void RedactModel.availability().then(status => {
  if (status === "available") $("engine-status").lastChild.textContent = " Rules + contextual AI ready";
});
