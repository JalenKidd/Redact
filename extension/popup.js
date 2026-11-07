const toggle = document.querySelector("#history");
const protection = document.querySelector("#protection-mode");
const modeDetail = document.querySelector("#mode-detail");
const status = document.querySelector("#status");
const clear = document.querySelector("#clear");
const confirmation = document.querySelector("#confirm");
const activityStatus = document.querySelector("#activity-status");
const pair = document.querySelector("#activity-pair");
const pairForm = document.querySelector("#activity-form");
const disconnect = document.querySelector("#activity-disconnect");
const modes = {
  off: "Redact pauses checking and recording new Chrome activity.",
  manual: "Use Check with Redact whenever you want to review a draft.",
  auto: "Redact replaces detected details when you press Send.",
};
document.querySelector("#dashboard").href = RedactConfig.pagesUrl + "#history";
document.querySelector("#local-dashboard").href = RedactConfig.dashboardUrl + "/#history";

async function preferences() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "REDACT_PREFERENCES" });
    if (!response || response.error || !Object.hasOwn(modes, response.mode)) throw new Error();
    toggle.checked = response.enabled;
    toggle.disabled = false;
    protection.querySelector(`input[value="${response.mode}"]`).checked = true;
    protection.disabled = false;
    modeDetail.textContent = modes[response.mode];
    clear.disabled = !response.count;
    status.textContent = (response.enabled ? "History on" : "History off") + " · " + response.count + " saved";
  } catch {
    status.textContent = "Could not read history preferences.";
  }
}

toggle.addEventListener("change", async () => {
  toggle.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "REDACT_SET_HISTORY", enabled: toggle.checked });
    if (response?.error || !response) throw new Error();
    await preferences();
  } catch {
    toggle.checked = !toggle.checked;
    toggle.disabled = false;
    status.textContent = "Could not save your preference.";
  }
});
protection.addEventListener("change", async event => {
  protection.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "REDACT_SET_MODE", mode: event.target.value });
    if (!response?.mode) throw new Error();
    await preferences();
  } catch {
    await preferences();
    modeDetail.textContent = "Could not save your protection mode.";
  }
});

async function showActivity(message) {
  try {
    const response = await chrome.runtime.sendMessage({ type: "REDACT_ACTIVITY_STATUS" });
    if (!response || response.error) throw new Error();
    pair.hidden = response.linked;
    disconnect.hidden = !response.linked;
    activityStatus.textContent = message || (!response.linked ? "Usage sync is off."
      : response.pending ? "Linked · " + response.pending + " waiting to sync"
        : "Linked · Chrome shares new redacted sends.");
  } catch {
    activityStatus.textContent = "Could not check Chrome usage sync.";
  }
}

pairForm.addEventListener("submit", async event => {
  event.preventDefault();
  const submit = pairForm.querySelector("button");
  submit.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "REDACT_ACTIVITY_LINK", code: pairForm.querySelector("#activity-code").value.trim(),
    });
    if (!response?.linked) throw new Error(response?.error || "Could not link Chrome.");
    pairForm.reset();
    await showActivity();
  } catch (error) {
    activityStatus.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

disconnect.addEventListener("click", async () => {
  disconnect.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "REDACT_ACTIVITY_DISCONNECT" });
    if (typeof response?.revoked !== "boolean") throw new Error();
    await showActivity(response.revoked ? "Usage sync is off." : "Sync is off here. Remove Chrome from Devices when online.");
  } catch {
    activityStatus.textContent = "Could not disconnect Chrome.";
  } finally {
    disconnect.disabled = false;
  }
});
clear.addEventListener("click", () => confirmation.showModal());
confirmation.addEventListener("close", async () => {
  if (confirmation.returnValue !== "clear") return;
  try {
    const response = await chrome.runtime.sendMessage({ type: "REDACT_CLEAR_HISTORY" });
    if (!response?.cleared) throw new Error();
    await preferences();
  } catch {
    status.textContent = "Could not clear local history.";
  }
});
void preferences();
void showActivity();
