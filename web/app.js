const $ = id => document.getElementById(id);
const prompt = $("prompt");
const modal = $("modal");
const toast = $("toast");
const number = new Intl.NumberFormat();
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const desktop = globalThis.redactDesktop;
const motion = RedactMotion;
const historyStore = desktop || RedactHistory;
const syncClient = RedactSync.createSyncClient({
  baseURL: location.hostname === "127.0.0.1" ? location.origin : RedactConfig.syncUrl || RedactConfig.hostedUrl,
});

const routeNames = { tools: "AI tools", scan: "Check", history: "History", overview: "Overview", devices: "Devices" };
const scrollBehavior = () => matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
const tone = score => score >= 50 ? "high" : score >= 25 ? "moderate" : score > 0 ? "low" : "clear";

let activeRoute = "tools";
let selectedTool = null;
let focusDraftOnScan = false;
let demo = null;
let draftBeforeDemo = "";
let checkVersion = 0;
let historyVersion = 0;
let lastReview = null;
let liveHistory = { state: "idle", enabled: false, summaries: [], extensionConnected: false };
let toastTimer;
const expandedGroups = new Set();

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
  RedactModel.cancel();
  lastReview = null;
  ++checkVersion;
  $("check-prompt").disabled = false;
  if (!keepScore) motion.resetScore();
  $("check-result").hidden = true;
  $("rewrite-card").hidden = true;
  $("rewrite-options").open = $("score-details").open = false;
  $("highlighted").replaceChildren();
  $("rewritten").textContent = "";
  $("save-check").hidden = true;
}

function updateCount() {
  $("clear-draft").hidden = !prompt.value;
  $("char-limit").hidden = prompt.value.length < 19_000;
  $("char-count").textContent = number.format(prompt.value.length) + " / 20,000 characters";
}

function setDraft(text, keepScore = false) {
  prompt.value = text;
  updateCount();
  resetReview({ keepScore });
}

function listWords(items) {
  if (items.length === 1) return items[0];
  if (items.length === 2) return items[0] + " and " + items[1];
  return items.slice(0, -1).join(", ") + ", and " + items.at(-1);
}

function resultSummary(result, { pending = false, replaced = false } = {}) {
  if (pending) return "Checking your draft on this device…";
  if (replaced) return "Review your updated draft before sharing it.";
  const labels = result.reasons.map(reason => {
    const label = reason.label.toLowerCase();
    return (/^[aeiou]/.test(label) ? "an " : "a ") + label;
  });
  if (!labels.length) return "Redact did not find private details on this device. Take one more look before you share.";
  const destination = selectedTool && !demo ? " Copy the suggestion, then paste it into " + selectedTool.name + " yourself." :
    " Copy the suggestion, then paste it into the AI tool you use.";
  return "Redact found " + listWords(labels) + " on this device." + destination;
}

function showResult(text, result, { replaced = false, pending = false } = {}) {
  lastReview = { text, result, choices: {}, plan: null, pending };
  const hasFindings = result.matches.length > 0;
  const firstResult = $("check-result").hidden;
  $("check-result").hidden = false;
  $("result-heading").textContent = hasFindings ? "Private details found" : "No private details found";
  $("result-summary").textContent = resultSummary(result, { pending, replaced });
  $("result-labels").replaceChildren(...result.reasons.slice(0, 3).map(reason => node("li", "reason-chip", reason.label)));
  if (result.reasons.length > 3) $("result-labels").append(node("li", "reason-chip", "+" + (result.reasons.length - 3) + " more"));
  $("save-check").hidden = !!demo || pending;
  $("save-check").disabled = false;
  $("save-check").textContent = "Save check";
  const tag = tone(result.score);
  motion.score(result.score);
  $("score-ring").style.setProperty("--score-color", { high: "#d38c69", moderate: "#d4a96a", low: "#8ba969", clear: "#a3b884" }[tag]);
  $("score-rating").textContent = Redact.rating(result.score);
  $("score-rating").className = "score-badge " + tag;
  $("score-description").textContent = replaced ? "Draft replaced. Review it before sharing." :
    pending ? "Rules check ready. Checking context on this device…" :
      result.contextual ? "Checked with rules and on-device AI." : (result.coverage?.reason || "Rules only. Contextual coverage is limited.");
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

  $("rewrite-card").hidden = !hasFindings;
  $("highlighted").replaceChildren();
  $("rewritten").textContent = hasFindings ? result.rewritten : "";
  if (hasFindings) {
    let offset = 0;
    for (const match of result.matches) {
      $("highlighted").append(document.createTextNode(text.slice(offset, match.start)));
      const mark = node("mark", null, text.slice(match.start, match.end));
      mark.title = Redact.categories[match.kind].label;
      mark.dataset.occurrence = match.id;
      $("highlighted").append(mark);
      offset = match.end;
    }
    $("highlighted").append(document.createTextNode(text.slice(offset)));
  }
  $("rewrite-choices").replaceChildren();
  const counts = {};
  for (const match of result.matches) {
    const row = node("div", "rewrite-choice");
    const label = node("label");
    const occurrence = counts[match.kind] = (counts[match.kind] || 0) + 1;
    const id = `choice-${match.start}-${match.end}`;
    label.htmlFor = id;
    label.append(node("strong", null, Redact.categories[match.kind].label + " " + occurrence),
      node("code", null, text.slice(match.start, match.end)));
    const select = node("select");
    select.id = id;
    select.disabled = pending;
    for (const [value, title] of [["replace", "Replace with placeholder"], ["keep", "Keep needed context"]]) {
      const option = node("option", null, title);
      option.value = value;
      select.append(option);
    }
    select.addEventListener("change", () => {
      if (lastReview?.text !== text || lastReview.result !== result) return;
      lastReview.choices[match.id] = select.value;
      updateRewrite();
    });
    row.append(label, select);
    if (match.kind === "medical") row.append(node("small", null, "Removing a condition may make health-related guidance less useful. Keep it if the task needs it."));
    $("rewrite-choices").append(row);
  }
  $("copy-rewrite").disabled = $("replace-draft").disabled = pending;
  renderResultActions();
  updateRewrite();
  if (firstResult) motion.reveal($("check-result"));
  if (!pending) $("announcement").textContent = $("result-heading").textContent + ". " + $("result-summary").textContent;
}

function updateRewrite() {
  if (!lastReview) return;
  const { text, result, choices } = lastReview;
  const plan = Redact.rewrite(text, result, choices);
  lastReview.plan = plan;
  $("rewritten").textContent = plan.text;
  const kept = plan.edits.filter(edit => edit.action === "keep").length;
  $("rewrite-comparison").textContent = `Original ${result.score}/100 → Revised ${plan.score}/100. ` +
    (kept ? `${kept} detail${kept === 1 ? "" : "s"} kept by you. ` : "") +
    "Same rules and retained contextual findings; the rewrite has not received a new AI scan. Zero means no detected signals.";
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
  showResult(text, rules, { pending: !demo });
  if (activeRoute === "scan") {
    $("result-heading").focus({ preventScroll: true });
    $("check-result").scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  }
  if (demo) {
    updateDemo(rules.matches.length ? "02 / Review the flagged details, then choose Replace draft." :
      "03 / Your practice draft is ready. Simulate a send to see its exposure summary.");
    $("demo-send").hidden = !!rules.matches.length;
  } else if (version === checkVersion) {
    $("check-prompt").disabled = true;
    const result = await RedactModel.check(text);
    if (version === checkVersion) {
      showResult(text, result);
      $("check-prompt").disabled = false;
    }
  }
}

async function replaceDraft() {
  if (!lastReview || lastReview.text !== prompt.value) return;
  const review = lastReview;
  const plan = review.plan;
  const replacing = new Set(plan.edits.filter(edit => edit.action === "replace").map(edit => edit.id));
  const marks = $("rewrite-options").open
    ? [...$("highlighted").querySelectorAll("mark")].filter(mark => replacing.has(mark.dataset.occurrence))
    : [];
  const choices = $("rewrite-choices").querySelectorAll("select");
  $("replace-draft").disabled = true;
  choices.forEach(select => { select.disabled = true; });
  await motion.redact(marks);
  if (review !== lastReview || review.text !== prompt.value) return;
  $("replace-draft").disabled = false;
  choices.forEach(select => { select.disabled = false; });
  const before = review.result.score;
  const text = plan.text;
  const prior = lastReview.result;
  const contextual = plan.matches.filter(match => match.source === "context")
    .map(match => ({ kind: match.kind, text: text.slice(match.start, match.end) }));
  const result = { ...Redact.scan(text, contextual), contextual: prior.contextual, coverage: prior.coverage };
  setDraft(text, true);
  showResult(text, result, { replaced: true });
  if (demo) {
    updateDemo("03 / Exposure dropped from " + before + " to " + result.score + ". Simulate a send to see the summary.");
    $("demo-send").hidden = false;
    motion.reveal($("demo-send"));
    $("simulate-send").focus({ preventScroll: true });
    $("demo-send").scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
  } else if (activeRoute === "scan") {
    prompt.focus({ preventScroll: true });
    $("draft-heading").scrollIntoView({ behavior: scrollBehavior(), block: "center" });
  }
  notify("Selected details replaced. Review the draft before sharing.");
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
    overview: "Explore the activity and exposure categories from the fictional checks.",
    scan: "01 / Check this fictional draft before sharing it with AI.",
    history: "See how fictional prompts rank by exposure score.",
    tools: "Pick ChatGPT, then check a prompt or open the official site.",
    devices: "Leave rehearsal mode to connect a real device.",
  } };
  document.body.classList.add("rehearsing");
  renderDestination();
  $("demo-banner").hidden = false;
  $("demo-send").hidden = true;
  $("start-demo").firstChild.textContent = "Restart tour ";
  setDraft(Redact.sample);
  navigate("scan");
}

function endDemo() {
  demo = null;
  document.body.classList.remove("rehearsing");
  renderDestination();
  $("demo-banner").hidden = true;
  $("demo-send").hidden = true;
  $("start-demo").firstChild.textContent = "Take a tour ";
  setDraft(draftBeforeDemo);
  draftBeforeDemo = "";
  if (activeRoute === "history") void refreshHistory();
  document.dispatchEvent(new Event("redact:history"));
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
  demo.instructions.history = "04 / Compare the new " + result.score + "-point summary with earlier fictional prompts. Then explore AI tools.";
  $("history-filter").value = "all";
  $("history-sort").value = "score";
  navigate("history");
  notify("Fictional summary added to rehearsal history.");
}

function parseSummaries(value) {
  if (!Array.isArray(value)) return [];
  const unique = new Map();
  for (const item of value) {
    const summary = RedactSync.cleanSummary(item);
    if (summary) unique.set(JSON.stringify(summary), summary);
  }
  return [...unique.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, 500);
}

function visibleSummaries() {
  if (demo) return demo.summaries;
  const synced = syncClient.status();
  return synced.connected ? synced.summaries : liveHistory.summaries;
}

function readExtensionHistory() {
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
  const [local, extension] = await Promise.all([
    historyStore.getHistory().catch(() => null), desktop ? null : readExtensionHistory(),
  ]);
  if (version !== historyVersion || demo) return;
  const summaries = parseSummaries([...(local?.summaries || []), ...(extension?.summaries || [])]);
  liveHistory = {
    state: local || extension ? "connected" : "disconnected",
    enabled: local?.enabled === true, summaries, extensionConnected: !!extension,
  };
  if (syncClient.status().connected) {
    try { await syncClient.ingest(summaries); } catch {}
    void syncClient.sync().catch(() => {});
  }
  if (activeRoute === "history") renderHistory();
  document.dispatchEvent(new Event("redact:history"));
}

function renderHistory() {
  $("history-import").hidden = Boolean(demo);
  $("history-options").hidden = Boolean(demo);
  const summaries = visibleSummaries();
  const source = $("history-source");
  const content = $("history-content");
  content.replaceChildren();

  const sync = syncClient.status();
  if (sync.connected) {
    source.textContent = sync.phase === "offline" ? "Offline. Showing your last synced checks." : "Showing saved checks from your linked devices.";
  } else if (liveHistory.state === "connected") {
    const location = liveHistory.extensionConnected ? "This browser and your Chrome extension." : "This device.";
    source.textContent = location + (liveHistory.enabled ? " Saving is on." : " Saving is off.");
  } else if (liveHistory.state === "loading") {
    source.textContent = "Loading your saved checks…";
  } else {
    source.textContent = "Couldn’t load saved checks. Try refreshing.";
  }

  $("history-filters").hidden = !summaries.length;
  const filter = $("history-filter").value;
  const sort = $("history-sort").value;
  const visible = summaries.filter(summary => filter === "all" || (filter === "high") === (summary.score >= 50));
  visible.sort((first, second) => (sort === "score" ? second.score - first.score : 0) || second.timestamp - first.timestamp);
  if (!visible.length) {
    const empty = node("div", "simple-empty");
    if (summaries.length) {
      empty.append(node("h2", null, "No matches"), node("p", null, "Change the filter to see more checks."));
    } else if (liveHistory.state === "loading") {
      empty.append(node("p", null, "Loading your saved checks…"));
    } else {
      const check = node("a", "primary-button", "Check a prompt");
      check.href = "#scan";
      empty.append(node("h2", null, "No saved checks yet"), node("p", null, "After you check a prompt, choose Save check to find it here later."), check);
    }
    content.append(empty);
    return;
  }

  const list = node("ul", "saved-checks");
  for (const summary of visible) {
    const row = node("li");
    const meta = node("div", "saved-check-meta");
    const date = new Date(summary.timestamp);
    const time = node("time", null, dateFormat.format(date));
    time.dateTime = date.toISOString();
    meta.append(node("strong", null, summary.provider), time);
    const score = node("span", "history-score score-badge " + tone(summary.score));
    score.append(node("b", null, summary.score), document.createTextNode(" / 100"));
    score.setAttribute("aria-label", "Exposure score " + summary.score + " out of 100");
    const labels = summary.kinds.filter(kind => Object.hasOwn(Redact.categories, kind)).map(kind => Redact.categories[kind].label);
    row.append(meta, node("p", "saved-check-reasons", labels.join(", ") || "No private details found"), score);
    list.append(row);
  }
  content.append(list);
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
  const loading = node("p", null, "Loading your local preferences…");
  openDialog("REDACT / DESKTOP", "Your history, on this device.", loading);
  let state;
  try {
    state = await historyStore.getHistory();
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
      await historyStore.setHistoryEnabled(toggle.checked);
      await refreshHistory();
      notify(toggle.checked ? "You can now save manual check summaries." : "Saving is off. Existing summaries are still available.");
    } catch {
      toggle.checked = !toggle.checked;
      notify("Could not save the history preference.");
    } finally {
      toggle.disabled = false;
    }
  });
  const clear = button(desktop ? "Clear desktop history" : "Clear browser history", "secondary-button", () => {
    const actions = node("div", "dialog-actions");
    actions.append(button("Cancel", "secondary-button", () => void showDesktopSettings()), button("Clear history", "primary-button", async () => {
      try {
        await historyStore.clearHistory();
        await refreshHistory();
        modal.close();
        notify("Local history cleared.");
      } catch {
        notify("Could not clear desktop history.");
      }
    }));
    openDialog("REDACT / HISTORY", "Clear local history?", node("p", null, "This removes the saved check summaries on this device. Manage synced history under Devices."), actions);
  });
  clear.disabled = !state.summaries.length;
  const actions = node("div", "dialog-actions");
  actions.append(clear);
  openDialog("REDACT / DESKTOP", "Your history, on this device.", label,
    node("p", null, "Save check stores the date, score, and category labels for a manual check. Your draft stays in the app window."), actions);
}

async function saveDesktopCheck(review = lastReview, permissionButton) {
  const save = $("save-check");
  if (demo || !review || review !== lastReview || review.text !== prompt.value || save.disabled) return;
  save.disabled = true;
  try {
    if (permissionButton) {
      permissionButton.disabled = true;
      await historyStore.setHistoryEnabled(true);
    } else if (!(await historyStore.getHistory()).enabled) {
      if (review !== lastReview) return;
      const approve = button("Allow and save", "primary-button", () => void saveDesktopCheck(review, approve));
      const actions = node("div", "dialog-actions");
      actions.append(approve, button("Cancel", "secondary-button", () => modal.close()));
      const syncNote = syncClient.status().connected ? " Your linked devices can see the summary." : "";
      openDialog("REDACT / HISTORY", "Save this check?",
        node("p", null, "Redact saves the date, score, and types of details it found. Your draft stays on this device." + syncNote), actions);
      return;
    }
    if (review !== lastReview) return;
    await historyStore.saveSummary(review.result.reasons.map(reason => reason.kind));
    await refreshHistory();
    if (permissionButton && modal.open && modal.contains(permissionButton)) modal.close();
    if (review === lastReview) {
      save.textContent = "Saved ✓";
      save.disabled = true;
    }
    notify("Check saved to History.");
  } catch {
    notify("Could not save this check summary.");
  } finally {
    if (permissionButton) permissionButton.disabled = false;
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

function policyDetails(policy) {
  const details = node("details", "tool-privacy");
  details.append(node("summary", null, "Privacy and data settings"));
  for (const [question, answer] of [
    ["What can it collect?", policy.collects],
    ["Can it use my chats for training?", policy.training],
    ["What can I change?", policy.controls],
  ]) {
    const section = node("section", "policy-question");
    section.append(node("h3", null, question), node("p", null, answer));
    details.append(section);
  }
  const controls = node("div", "policy-buttons");
  controls.append(button("Turn off training", "secondary-button", () => showPolicyAction(policy, "optOut")),
    button("Delete data", "secondary-button", () => showPolicyAction(policy, "remove")));
  const sources = node("div", "policy-links");
  for (const source of policy.sources) sources.append(link(source.label + " ↗", source.url));
  details.append(controls, sources, node("p", "source-date", "Last checked " + policy.checked));
  return details;
}

function toolMark(tool) {
  const mark = node("span", "tool-mark " + tool.color, tool.mark);
  mark.setAttribute("aria-hidden", "true");
  return mark;
}

function renderDestination() {
  const tool = demo ? null : selectedTool;
  $("tool-destination").hidden = !tool;
  if (tool) {
    $("selected-tool").replaceChildren(toolMark(tool), node("span", null, "Checking for " + tool.name));
    const destination = $("open-destination");
    destination.href = tool.url;
    destination.textContent = "Open " + tool.name + " ↗";
  }
  renderResultActions();
}

function renderResultActions() {
  const hasFindings = Boolean(lastReview?.result.matches.length);
  const tool = selectedTool && !demo;
  $("result-actions").hidden = !lastReview || lastReview.pending || Boolean(demo) || (hasFindings && !tool);
  $("copy-draft").hidden = hasFindings;
  $("open-destination").hidden = !tool;
}

function openTool(tool) {
  const identity = node("div", "tool-identity");
  identity.append(toolMark(tool), node("p", null, tool.description));
  const actions = node("div", "dialog-actions");
  actions.append(button("Check a prompt", "primary-button", () => {
    selectedTool = tool;
    renderDestination();
    modal.close();
    focusDraftOnScan = true;
    navigate("scan");
  }), link("Open " + tool.name, tool.url, "secondary-button"));
  const policy = RedactPolicies.find(item => item.id === tool.id);
  const privacy = policy ? policyDetails(policy) : tool.privacy ? link("Official privacy information ↗", tool.privacy, "tool-privacy-link") : null;
  openDialog("AI TOOLS", tool.name, identity, actions, ...(privacy ? [privacy] : []));
}

function renderTools() {
  const query = $("tool-search").value.trim();
  const preview = RedactCatalog.previewCount || 4;
  const container = $("tool-groups");
  container.replaceChildren();
  let total = 0;
  RedactCatalog.toolGroups.forEach((group, index) => {
    const matches = group.tools.filter(tool => RedactCatalog.matchesQuery(tool, group.name, query));
    if (!matches.length) return;
    total += matches.length;
    const id = "tool-group-" + index;
    const searching = Boolean(query);
    const expanded = searching || expandedGroups.has(group.name);
    const extras = !searching && matches.length > preview ? matches.slice(preview) : [];
    const section = node("section", "tool-group");
    section.setAttribute("aria-labelledby", id + "-title");
    const header = node("div", "tool-group-header");
    const title = node("h2", null, group.name);
    title.id = id + "-title";
    header.append(title);
    const list = node("ul", "tool-row" + (expanded && extras.length ? " expanded" : ""));
    list.id = id;
    for (const [offset, tool] of matches.entries()) {
      const tile = button("", "tool-tile", () => openTool(tool));
      tile.append(toolMark(tool), node("span", "tool-name", tool.name));
      tile.setAttribute("aria-label", tool.name);
      const item = node("li");
      item.append(tile);
      if (extras.length && offset >= preview && !expanded) item.hidden = true;
      list.append(item);
    }
    if (extras.length) {
      const label = "Show all " + matches.length;
      const toggle = button(expanded ? "Show fewer" : label, "text-button", () => {
        if (expandedGroups.has(group.name)) expandedGroups.delete(group.name);
        else expandedGroups.add(group.name);
        renderTools();
      });
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.setAttribute("aria-controls", id);
      header.append(toggle);
    }
    section.append(header, list);
    container.append(section);
  });
  $("no-tools").hidden = total > 0;
  $("tool-search-status").textContent = query ? total + (total === 1 ? " tool found" : " tools found") : "";
}

async function showAi() {
  if (desktop?.getAiStatus) {
    const info = node("p", null, "Checking the local Ollama service…");
    const actions = node("div", "dialog-actions");
    const details = node("p", null, "When enabled, checking a draft sends up to 6,000 characters to Ollama at 127.0.0.1 on this computer. Redact requires cloud features disabled and a locally installed qwen3:4b model. This choice resets when Redact closes. It does not save your draft or enable device sync.");
    openDialog("REDACT / DESKTOP CHECK ENGINE", "Contextual AI on this device", info, details, actions);
    try {
      const status = await desktop.getAiStatus();
      info.textContent = status.reason;
      if (status.state === "available" || status.state === "disabled") {
        const enabled = status.state === "available";
        const control = button(enabled ? "Disable contextual AI" : "Enable for this session", "primary-button", async () => {
          control.disabled = true;
          try {
            const changed = await desktop.configureAi(!enabled);
            resetReview();
            info.textContent = changed.reason;
            $("engine-status").lastChild.textContent = changed.state === "available" ? " Rules + local AI ready" : " Rules ready";
            control.hidden = true;
          } catch { info.textContent = "Local AI could not be configured. Rules remain available."; }
          finally { control.disabled = false; }
        });
        actions.append(control);
      }
    } catch { info.textContent = "Local AI is unavailable. The rules scanner still works."; }
    return;
  }
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
  else if (activeRoute === "scan") prompt.focus({ preventScroll: true });
  else $("tools-heading").focus({ preventScroll: true });
}

function routeFromHash() {
  const hash = location.hash.slice(1);
  return Object.hasOwn(routeNames, hash) ? hash : "tools";
}

function renderRoute(route, animate = true) {
  const previous = activeRoute;
  activeRoute = route;
  for (const key of Object.keys(routeNames)) {
    $(key + "-page").hidden = key !== route;
    const tab = document.querySelector('[data-route="' + key + '"]');
    tab.classList.toggle("active", key === route);
    if (key === route) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
  motion.navigation(document.querySelector('[data-route="' + route + '"]'), previous !== route);
  if (animate && previous !== route) {
    const order = Object.keys(routeNames);
    motion.page($(route + "-page"), order.indexOf(route) > order.indexOf(previous) ? 1 : -1);
  }
  if (demo) $("demo-instruction").textContent = demo.instructions[route];
  if (route === "scan" && focusDraftOnScan) {
    focusDraftOnScan = false;
    prompt.focus({ preventScroll: true });
  }
  if (route === "history") renderHistory();
  if (["history", "overview", "devices"].includes(route)) void refreshHistory();
  document.dispatchEvent(new CustomEvent("redact:route", { detail: route }));
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
  setDraft(Redact.sample);
  $("demo-send").hidden = true;
  if (demo) updateDemo("01 / Check this fictional draft before sharing it with AI.");
  prompt.focus();
});
$("clear-draft").addEventListener("click", () => {
  setDraft("");
  $("demo-send").hidden = true;
  prompt.focus();
});
prompt.addEventListener("input", () => {
  updateCount();
  resetReview();
  $("demo-send").hidden = true;
});
$("check-prompt").addEventListener("click", () => void runCheck());
$("copy-rewrite").addEventListener("click", () => {
  if (lastReview?.text !== prompt.value) return;
  const destination = selectedTool && !demo ? " Open " + selectedTool.name + " and paste it there." : " Paste it into the AI tool you use.";
  void copy(lastReview.plan.text, "Suggestion copied." + destination);
});
$("copy-draft").addEventListener("click", () => {
  if (lastReview?.text === prompt.value) void copy(prompt.value, "Draft copied.");
});
$("tool-search").addEventListener("input", renderTools);
for (const check of document.querySelectorAll("[data-check-any]")) {
  check.addEventListener("click", () => {
    selectedTool = null;
    renderDestination();
    focusDraftOnScan = true;
  });
}
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
  motion.switchPage(activeRoute, routeFromHash(), routeNames, renderRoute);
});
window.addEventListener("focus", () => {
  if (!demo) void refreshHistory();
});

RedactHistoryUI.init({ openDialog, openDraft: text => {
  if (demo) endDemo();
  setDraft(text);
  navigate("scan");
  prompt.focus({ preventScroll: true });
} });
renderTools();
if (desktop) {
  document.body.classList.add("desktop-app");
  if (desktop.platform === "darwin") document.body.classList.add("desktop-mac");
}
$("workspace").hidden = false;
if (location.hash === "#demo") startDemo();
else {
  renderRoute(routeFromHash());
  let seenWelcome = false;
  try { seenWelcome = localStorage.getItem("redact.welcomeSeen.v1") === "true"; } catch {}
  if (!seenWelcome && ["", "#tools", "#scan"].includes(location.hash)) showWelcome();
}
void refreshHistory();
void RedactModel.availability().then(status => {
  if (status === "available") $("engine-status").lastChild.textContent = " Rules + contextual AI ready";
});
