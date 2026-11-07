// Test-only shim: this restricted Linux runner cannot create the Unix socket
// required by Chromium's singleton lock. Production launches never load this.
if (process.env.REDACT_HEADLESS !== "1" || !process.env.REDACT_USER_DATA_DIR) {
  throw new Error("The headless bootstrap requires an isolated test profile");
}
require("electron").app.requestSingleInstanceLock = () => true;
