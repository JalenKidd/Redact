const toggle = document.querySelector("#history");
const autoToggle = document.querySelector("#auto-redact");
const status = document.querySelector("#status");
const clear = document.querySelector("#clear");
const confirmation = document.querySelector("#confirm");
document.querySelector("#dashboard").href = RedactConfig.pagesUrl + "#history";
document.querySelector("#local-dashboard").href = RedactConfig.dashboardUrl + "/#history";

async function preferences() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "REDACT_PREFERENCES" });
    if (response?.error || !response) throw new Error();
    toggle.checked = response.enabled;
    toggle.disabled = false;
    autoToggle.checked = response.autoRedact;
    autoToggle.disabled = false;
    clear.disabled = !response.count;
    status.textContent = (response.enabled ? "History on" : "History off") + " · " + response.count + " saved";
  } catch {
    status.textContent = "Could not read history preferences.";
  }
}

for (const [control, type] of [[toggle, "REDACT_SET_HISTORY"], [autoToggle, "REDACT_SET_AUTO"]]) {
  control.addEventListener("change", async () => {
    control.disabled = true;
    try {
      const response = await chrome.runtime.sendMessage({ type, enabled: control.checked });
      if (response?.error || !response) throw new Error();
      await preferences();
    } catch {
      control.checked = !control.checked;
      control.disabled = false;
      status.textContent = "Could not save your preference.";
    }
  });
}
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
