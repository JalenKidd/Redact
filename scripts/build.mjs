import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = join(root, "dist");
const extension = join(root, "build", "extension");
const loopback = "http://127.0.0.1:4173";
const hosted = new URL(process.env.REDACT_SITE_URL || "https://redact-pluto-hacks.electbush1.chatgpt.site");
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
execFileSync("zip", ["-q", "-r", join(dist, "redact-extension.zip"), "."], { cwd: extension });
console.log("Dashboard built in dist/");
console.log("Load unpacked Chrome extension from build/extension/");
console.log("Chrome extension ID " + id);
