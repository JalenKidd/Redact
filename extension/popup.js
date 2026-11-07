const toggle = document.querySelector("#history");
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
