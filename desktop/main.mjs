import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, net, protocol, session, shell } from "electron";
import { join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHistoryStore } from "./history-store.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const renderer = join(root, "dist");
const home = "redact://app/index.html";
const externalHosts = new Set([
  "chatgpt.com", "privacy.openai.com", "openai.com", "help.openai.com",
  "chat.deepseek.com", "cdn.deepseek.com", "developer.chrome.com",
]);
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
let window;

app.setName("Redact");
if (process.env.REDACT_USER_DATA_DIR) {
  app.setPath("userData", resolve(process.env.REDACT_USER_DATA_DIR));
}
protocol.registerSchemesAsPrivileged([{ scheme: "redact", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (window?.isMinimized()) window.restore();
    window?.show();
    window?.focus();
  });
  app.whenReady().then(async () => {
    protocol.handle("redact", async request => {
      try {
        const url = new URL(request.url);
        if (url.hostname !== "app" || !["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 403 });
        const file = resolve(renderer, "." + decodeURIComponent(url.pathname));
        if (!file.startsWith(renderer + sep)) return new Response(null, { status: 403 });
        const response = await net.fetch(pathToFileURL(file).href);
        const headers = new Headers(response.headers);
        headers.set("Content-Security-Policy", csp);
        headers.set("X-Content-Type-Options", "nosniff");
        return new Response(response.body, { status: response.status, headers });
      } catch {
        return new Response("Asset unavailable", { status: 404 });
      }
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);

    const history = createHistoryStore(join(app.getPath("userData"), "exposure-history.json"));
    for (const [channel, handler] of [
      ["redact:history", () => history.getHistory()],
      ["redact:set-history", enabled => history.setEnabled(enabled)],
      ["redact:save-summary", kinds => history.saveSummary(kinds)],
      ["redact:clear-history", () => history.clear()],
      ["redact:copy-text", text => {
        if (typeof text !== "string" || text.length > 20000) throw new Error("Invalid clipboard content.");
        clipboard.writeText(text);
      }],
    ]) {
      ipcMain.handle(channel, (event, ...args) => {
        if (!window || event.sender !== window.webContents ||
            event.senderFrame !== window.webContents.mainFrame ||
            event.senderFrame.url.split("#")[0] !== home) throw new Error("Untrusted app request.");
        return handler(...args);
      });
    }

    createWindow();
    const template = [
      ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
      { role: "fileMenu" }, { role: "editMenu" },
      { role: "viewMenu" }, { role: "windowMenu" },
      { label: "Help", submenu: [{ label: "About Redact", click: () => {
        dialog.showMessageBox(window, { type: "info", title: "Redact", message: "Think before you send.", detail: "On-device prompt privacy · Built for Pluto Hacks" });
      } }] },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    app.on("activate", () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  }).catch(error => {
    console.error(error);
    dialog.showErrorBox("Redact could not start", "Run npm run build in the project folder and try again.");
    app.quit();
  });
}

function createWindow() {
  window = new BrowserWindow({
    width: 1280, height: 900, minWidth: 720, minHeight: 640,
    title: "Redact", backgroundColor: "#f6f5f1",
    icon: join(root, "desktop", "icon.png"),
    show: false,
    webPreferences: {
      preload: join(root, "desktop", "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const destination = new URL(url);
      if (destination.protocol === "https:" && externalHosts.has(destination.hostname)) {
        void shell.openExternal(url).catch(error => console.error("Could not open provider link", error.message));
      }
    } catch {}
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url.split("#")[0] !== home) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", event => event.preventDefault());
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => { window = null; });
  void window.loadURL(home);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
