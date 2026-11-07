import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { zipSync } from "fflate";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = join(root, "dist");
const extension = join(root, "build", "extension");
const loopback = "http://127.0.0.1:4173";
const hosted = new URL(process.env.REDACT_SITE_URL || "https://redact-pluto-hacks.electbush1.chatgpt.site");
const syncURL = new URL(process.env.REDACT_SYNC_URL || hosted.origin);
if (hosted.protocol !== "https:") throw new Error("REDACT_SITE_URL must use HTTPS.");

const key = (await readFile(join(root, "extension", "public-key.txt"), "utf8")).trim();
const id = createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32)
  .replace(/[0-9a-f]/g, digit => String.fromCharCode(97 + Number.parseInt(digit, 16)));
const manifest = JSON.parse(await readFile(join(root, "extension", "manifest.json"), "utf8"));
manifest.key = key;
manifest.externally_connectable = {
  matches: ["http://127.0.0.1/*", hosted.origin + "/*"],
};
const config = "globalThis.RedactConfig = Object.freeze(" + JSON.stringify({
  extensionId: id,
  dashboardUrl: loopback,
  hostedUrl: hosted.origin,
  syncUrl: syncURL.origin,
  allowedOrigins: [loopback, hosted.origin],
}, null, 2) + ");\n";

await Promise.all([rm(dist, { recursive: true, force: true }), rm(extension, { recursive: true, force: true })]);
await Promise.all([mkdir(dist, { recursive: true }), mkdir(extension, { recursive: true })]);
await Promise.all([
  cp(join(root, "web"), dist, { recursive: true }),
  cp(join(root, "extension"), extension, {
    recursive: true,
    filter: path => !path.endsWith("public-key.txt") && !path.endsWith("manifest.json"),
  }),
  cp(join(root, "shared"), dist, { recursive: true }),
  cp(join(root, "shared"), extension, { recursive: true }),
  writeFile(join(dist, "config.js"), config),
  writeFile(join(extension, "config.js"), config),
  writeFile(join(extension, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n"),
]);
await Promise.all([
  build({ entryPoints: [join(root, "shared/ai-tools.mjs")], outfile: join(dist, "ai-tools.js"), bundle: true, format: "iife", globalName: "RedactCatalog", target: "es2022" }),
  build({ entryPoints: [join(root, "shared/sync.mjs")], outfile: join(dist, "sync.js"), bundle: true, format: "iife", globalName: "RedactSync", target: "es2022" }),
  build({ entryPoints: [join(root, "web/vendor-entry.js")], outfile: join(dist, "qr.js"), bundle: true, format: "iife", target: "es2022" }),
]);
await rm(join(dist, "vendor-entry.js"), { force: true });
await writeFile(join(dist, "redact-extension.zip"), zipSync(await archiveFiles(extension)));
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".zip": "application/zip" };
const assets = {};
for (const [name, bytes] of Object.entries(await archiveFiles(dist))) {
  const suffix = name.slice(name.lastIndexOf("."));
  assets["/" + name] = { type: types[suffix] || "application/octet-stream", body: Buffer.from(bytes).toString("base64") };
}
await build({ entryPoints: [join(root, "worker/index.mjs")], outfile: join(dist, "server/index.js"), bundle: true, format: "esm", platform: "browser", target: "es2022", define: { __REDACT_ASSETS__: JSON.stringify(assets), __REDACT_ORIGIN__: JSON.stringify(hosted.origin) } });
await mkdir(join(dist, ".openai"), { recursive: true });
await cp(join(root, ".openai/hosting.json"), join(dist, ".openai/hosting.json"));
console.log("Dashboard built in dist/");
console.log("Load unpacked Chrome extension from build/extension/");
console.log("Chrome extension ID " + id);

async function archiveFiles(directory, prefix = "") {
  const files = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    const file = join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(files, await archiveFiles(file, name + "/"));
    else files[name] = await readFile(file);
  }
  return files;
}
