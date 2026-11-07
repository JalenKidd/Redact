(() => {
  const date = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const examples = {
    job: "Write a short cover letter for a library assistant role. My email is alex@example.com and my phone number is (202) 555-0135. Mention my volunteer work.",
    support: "Help me write a support request about an account issue. My account email is casey@example.com. The test API key is sk-abcdefghijklmnopqrstuvwxyz123456789.",
  };
  let metricKey = "";
  let deviceKey = "";
  let busy = false;
  let invitation;
  let invitationTimer;

  function deviceIdentity() {
    const ua = navigator.userAgent;
    if (/iPad|Tablet/i.test(ua) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return { name: "Tablet", kind: "tablet" };
    if (/iPhone|Android.*Mobile/i.test(ua)) return { name: /iPhone/.test(ua) ? "iPhone" : "Android phone", kind: "phone" };
    if (/Android/.test(ua)) return { name: "Android tablet", kind: "tablet" };
    if (desktop) return { name: { darwin: "Mac", win32: "Windows PC", linux: "Linux computer" }[desktop.platform] || "Computer", kind: "computer" };
    return { name: "Browser", kind: "browser" };
  }

  function metric(label, value, detail, icon, shade) {
    const item = node("article", "workspace-metric " + shade);
    const main = node("div");
    main.append(node("span", "metric-label", label), node("strong", "metric-value", value), node("span", "metric-detail", detail));
    const emblem = node("span", "metric-icon", icon);
    emblem.setAttribute("aria-hidden", "true");
    item.append(main, emblem);
    return item;
  }

  function renderOverview() {
    const summaries = visibleSummaries();
    const keys = JSON.stringify([summaries, !!demo]);
    if (keys === metricKey) return;
    metricKey = keys;
    $("overview-empty").hidden = summaries.length > 0;
    $("overview-recent").hidden = $("overview-categories").hidden = !summaries.length;
    $("overview-usage").hidden = Boolean(demo);
    const highs = summaries.filter(summary => summary.score >= 50).length;
    const average = summaries.length ? Math.round(summaries.reduce((sum, item) => sum + item.score, 0) / summaries.length) : "—";
    $("overview-metrics").replaceChildren(
      metric("Saved checks", summaries.length, demo ? "Fictional summaries" : "In this workspace", "▤", "violet"),
      metric("High exposure", highs, "Scores of 50 or more", "◈", "rose"),
      metric("Average score", average, "Across your saved checks", "◔", "mint"),
    );
    renderActivity(summaries);
  }

  function renderActivity(summaries) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bins = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today);
      day.setDate(day.getDate() - 6 + index);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      const matches = summaries.filter(summary => summary.timestamp >= day.getTime() && summary.timestamp < next.getTime());
      return { day, count: matches.length, high: matches.filter(summary => summary.score >= 50).length };
    });
    const maximum = Math.max(1, ...bins.map(bin => bin.count));
    const chart = $("activity-chart");
    chart.replaceChildren();
    for (const [index, bin] of bins.entries()) {
      const bar = node("div", "activity-column");
      bar.style.setProperty("--bar-index", index);
      bar.setAttribute("aria-label", date.format(bin.day) + ": " + bin.count + " checks, " + bin.high + " high exposure");
      bar.title = date.format(bin.day) + " · " + bin.count + " checks";
      const track = node("div", "activity-track");
      const value = node("span", "activity-value");
      value.style.height = bin.count / maximum * 100 + "%";
      const high = node("i", "activity-high");
      high.style.height = (bin.count ? bin.high / bin.count * 100 : 0) + "%";
      value.append(high);
      track.append(value);
      bar.append(node("span", "bar-count", bin.count), track, node("span", "bar-day", weekday.format(bin.day)));
      chart.append(bar);
    }
    const categories = new Map();
    for (const summary of summaries) for (const kind of summary.kinds) categories.set(kind, (categories.get(kind) || 0) + 1);
    const top = [...categories].sort((a, b) => b[1] - a[1]).slice(0, 4);
    $("top-categories").replaceChildren();
    if (!top.length) $("top-categories").append(node("p", "panel-empty", "Save a check to see the categories Redact finds most often."));
    for (const [kind, count] of top) {
      const row = node("div", "category-row");
      const line = node("div", "category-line");
      line.append(node("span", null, Redact.categories[kind]?.label || kind), node("strong", null, count));
      const track = node("div", "category-track");
      const fill = node("span");
      fill.style.width = count / top[0][1] * 100 + "%";
      track.append(fill);
      row.append(line, track);
      $("top-categories").append(row);
    }
    $("recent-checks").replaceChildren();
    const recent = [...summaries].sort((a, b) => b.timestamp - a.timestamp).slice(0, 4);
    for (const summary of recent) {
      const row = node("div", "recent-row");
      const label = node("div");
      label.append(node("strong", null, summary.provider), node("small", null, date.format(new Date(summary.timestamp))));
      row.append(node("span", "recent-icon", "⌑"), label, node("span", "score-badge " + tone(summary.score), String(summary.score) + " / 100"));
      $("recent-checks").append(row);
    }
  }

  function renderDevices(state = syncClient.status()) {
    const isOnline = state.phase === "synced" || state.phase === "syncing";
    const last = state.lastSynced ? "Last synced at " + time.format(new Date(state.lastSynced)) : "";
    const phases = { local: "This device only", synced: "Sync is up to date", syncing: "Syncing", offline: "Offline", disconnected: "Device disconnected" };
    $("device-phase").textContent = phases[state.phase] || "This device only";
    $("device-status").dataset.phase = state.phase;
    $("device-status").hidden = !state.connected && state.phase !== "disconnected";
    $("device-heading").textContent = state.connected ? "Device sync is on" : "Connect your devices";
    $("device-detail").textContent = demo ? "Leave rehearsal mode to link your own devices." :
      state.error || (state.connected ? last || "Connecting to your devices…" : "Set up sync here, then scan a QR code with your other device.");
    $("create-sync").hidden = $("join-sync").hidden = state.connected;
    $("invite-device").hidden = $("sync-now").hidden = $("clear-sync-history").hidden = !state.connected;
    $("linked-devices").hidden = !state.connected;
    for (const id of ["create-sync", "join-sync", "invite-device", "sync-now", "clear-sync-history"]) $(id).disabled = busy || !!demo;
    document.querySelector(".device-network").classList.toggle("connected", state.connected && isOnline);
    const devices = state.devices;
    const signature = JSON.stringify([devices.map(device => [device.id, device.name, device.kind, Date.now() - device.lastSeen < 45_000]), state.deviceId, state.connected, isOnline, !!demo]);
    if (signature === deviceKey) return;
    deviceKey = signature;
    const list = $("device-list");
    list.replaceChildren();
    for (const device of devices) {
      const self = device.id === (state.deviceId || "local");
      const active = isOnline && Date.now() - device.lastSeen < 45_000;
      const row = node("div", "device-row");
      const info = node("div", "device-row-info");
      info.append(node("strong", null, device.name), node("small", null, self ? "This device" : active ? "Online now" : "Away"));
      const mark = node("span", "device-icon " + (active ? "online" : ""), device.kind === "phone" ? "▯" : device.kind === "tablet" ? "▥" : "▣");
      mark.setAttribute("aria-hidden", "true");
      row.append(mark, info);
      if (state.connected) {
        const actions = node("div", "device-row-actions");
        if (self) actions.append(button("Rename", "text-button", showRename));
        actions.append(button(self ? "Disconnect" : "Remove", "text-button", () => confirmRemoval(device, self)));
        for (const control of actions.children) control.disabled = !!demo;
        row.append(actions);
      }
      list.append(row);
    }
  }

  function renderPreferences(state = syncClient.status()) {
    const theme = state.preferences.appearance?.value || "aurora";
    document.body.dataset.appearance = theme;
    document.body.classList.toggle("compact-workspace", state.preferences.compact?.value === true);
    $("compact-layout").checked = state.preferences.compact?.value === true;
    $("compact-layout").disabled = !!demo;
    for (const button of document.querySelectorAll("[data-theme]")) {
      button.setAttribute("aria-pressed", String(button.dataset.theme === theme));
      button.disabled = !!demo;
    }
  }

  function render() {
    const state = syncClient.status();
    renderOverview();
    renderDevices(state);
    renderPreferences(state);
  }

  async function operate(operation, success) {
    if (busy || demo) return;
    busy = true;
    renderDevices();
    try {
      const result = await operation();
      if (success) notify(success);
      return result;
    } catch (error) {
      notify(error.message || "The sync request could not finish.");
      throw error;
    } finally {
      busy = false;
      renderDevices();
    }
  }

  function showDeviceForm(mode, value = "") {
    if (demo) return;
    const identity = deviceIdentity();
    const joining = mode === "join";
    const form = node("form", "device-form");
    const nameLabel = node("label", null, "Device name");
    const name = document.createElement("input");
    name.value = mode === "rename" ? syncClient.status().name : identity.name;
    name.required = true;
    name.maxLength = 48;
    name.autocomplete = "off";
    nameLabel.append(name);
    form.append(nameLabel);
    const code = document.createElement("input");
    if (joining) {
      const label = node("label", null, "Pairing code or link");
      code.value = value;
      code.placeholder = "Paste the code from your other device";
      code.required = true;
      code.maxLength = 1000;
      code.spellcheck = false;
      code.autocomplete = "off";
      label.append(code);
      form.append(label);
    }
    const message = node("p", "form-error");
    message.setAttribute("role", "alert");
    const submit = node("button", "primary-button", mode === "rename" ? "Save device name" : joining ? "Connect this device" : "Enable encrypted sync");
    submit.type = "submit";
    form.append(message, submit);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (submit.disabled) return;
      submit.disabled = true;
      message.textContent = "";
      try {
        await operate(() => mode === "rename" ? syncClient.rename(name.value) :
          joining ? syncClient.join(code.value, name.value, identity.kind) :
            syncClient.create(name.value, identity.kind, { appearance: document.body.dataset.appearance, compact: $("compact-layout").checked }),
        mode === "rename" ? "Device name saved." : "Device sync is enabled.");
        modal.close();
        await refreshHistory();
      } catch (error) {
        message.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    });
    openDialog("REDACT / DEVICES", mode === "rename" ? "Rename this device" : joining ? "Connect to your workspace" : "Enable device sync",
      node("p", null, mode === "rename" ? "Choose how this device appears to your other linked devices." :
        "Your saved scores, category labels, and appearance will be encrypted on this device and shared with the devices you pair."), form);
  }

  const showRename = () => showDeviceForm("rename");

  async function showInvitation() {
    try {
      invitation = await operate(() => syncClient.invitation());
      if (!invitation) return;
      const panel = node("div", "pairing-panel");
      const qr = document.createElement("canvas");
      qr.setAttribute("aria-label", "Scan this code with your other device’s camera");
      await RedactQr.toCanvas(qr, invitation.url, { width: 216, margin: 2, errorCorrectionLevel: "M", color: { dark: "#251b3b", light: "#ffffff" } });
      const count = node("p", "pairing-count");
      const code = node("code", "pairing-code", invitation.code);
      const copyCode = button("Copy pairing code", "primary-button", () => void copy(invitation.code, "Pairing code copied."));
      const copyLink = button("Copy link", "secondary-button", () => void copy(invitation.url, "Pairing link copied."));
      const actions = node("div", "dialog-actions");
      actions.append(copyCode, copyLink);
      const fallback = node("details", "pairing-fallback");
      fallback.append(node("summary", null, "Pair without a camera"), code, actions);
      panel.append(qr, count, fallback);
      openDialog("REDACT / DEVICES", "Scan to connect", node("p", null, "Open your phone’s camera and point it at this code."), panel);
      const tick = () => {
        const remaining = Math.max(0, Math.ceil((invitation.expires - Date.now()) / 1000));
        count.textContent = remaining ? "One-time code · expires in " + Math.floor(remaining / 60) + ":" + String(remaining % 60).padStart(2, "0") : "Code expired · generate a new code";
        copyCode.disabled = copyLink.disabled = !remaining;
        if (!remaining) clearInterval(invitationTimer);
      };
      clearInterval(invitationTimer);
      tick();
      invitationTimer = setInterval(tick, 1000);
    } catch {}
  }

  function confirmRemoval(device, self) {
    if (demo) return;
    const actions = node("div", "dialog-actions");
    actions.append(button("Cancel", "secondary-button", () => modal.close()), button(self ? "Disconnect device" : "Remove device", "primary-button", async () => {
      try {
        await operate(() => syncClient.remove(device.id), self ? "This device is disconnected." : "Device removed.");
        modal.close();
        await refreshHistory();
      } catch {}
    }));
    const finalDevice = self && syncClient.status().devices.length === 1;
    openDialog("REDACT / DEVICES", self ? "Disconnect this device?" : "Remove " + device.name + "?",
      node("p", null, finalDevice ? "Disconnecting the last device also removes the shared sync space." :
        "This device will need a new pairing code before it can sync again."), actions);
  }

  function clearSyncedHistory() {
    const actions = node("div", "dialog-actions");
    actions.append(button("Cancel", "secondary-button", () => modal.close()), button("Clear synced history", "primary-button", async () => {
      try {
        await operate(() => syncClient.clearHistory(), "Synced history cleared.");
        modal.close();
      } catch {}
    }));
    openDialog("REDACT / DEVICES", "Clear synced check summaries?", node("p", null, "These summaries will be removed from the shared history on your linked devices."), actions);
  }

  async function applyPreference(name, value) {
    if (demo) return;
    await syncClient.setPreference(name, value);
    if (syncClient.status().connected) void syncClient.sync().catch(() => {});
  }

  $("create-sync").addEventListener("click", () => showDeviceForm("create"));
  $("join-sync").addEventListener("click", () => showDeviceForm("join"));
  $("invite-device").addEventListener("click", () => void showInvitation());
  $("sync-now").addEventListener("click", () => void operate(async () => { await refreshHistory(); return syncClient.sync(); }, "Devices are up to date.").catch(() => {}));
  $("clear-sync-history").addEventListener("click", clearSyncedHistory);
  $("compact-layout").addEventListener("change", event => void applyPreference("compact", event.target.checked).catch(error => notify(error.message)));
  for (const control of document.querySelectorAll("[data-theme]")) {
    control.addEventListener("click", () => void applyPreference("appearance", control.dataset.theme).catch(error => notify(error.message)));
  }
  for (const control of document.querySelectorAll("[data-example]")) {
    control.addEventListener("click", () => {
      setDraft(examples[control.dataset.example]);
      $("demo-send").hidden = true;
      if (demo) updateDemo("01 / Check this fictional draft before sharing it with AI.");
      prompt.focus();
      motion.reveal(prompt.parentElement);
    });
  }
  modal.addEventListener("close", () => clearInterval(invitationTimer));
  for (const event of ["redact:route", "redact:history"]) document.addEventListener(event, render);
  syncClient.subscribe(() => {
    render();
    if (activeRoute === "history" && !demo) renderHistory();
  });
  new ResizeObserver(() => motion.navigation(document.querySelector("[data-route].active"), false)).observe(document.querySelector("nav"));
  setInterval(() => {
    if (!demo && (syncClient.status().connected || (!desktop && redactionActivity.isKeeping()))) void refreshHistory();
  }, 12_000);
  if (location.hash.startsWith("#pair=")) {
    const code = location.hash.slice(6);
    history.replaceState(null, "", "#devices");
    renderRoute("devices");
    showDeviceForm("join", code);
  }
  render();
})();
