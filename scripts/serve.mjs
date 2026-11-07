import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { createLocalDatabase } from "./local-db.mjs";
import worker from "../dist/server/index.js";

const root = fileURLToPath(new URL("../dist", import.meta.url));
const database = createLocalDatabase(process.env.REDACT_SYNC_DB || fileURLToPath(new URL("../.data/sync.sqlite", import.meta.url)));
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".zip": "application/zip",
};

createServer(async (request, response) => {
  const baseHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const url = new URL(request.url, "http://127.0.0.1:4173");
    if (url.pathname.startsWith("/api/")) {
      const options = { method: request.method, headers: request.headers };
      if (!["GET", "HEAD"].includes(request.method)) Object.assign(options, { body: Readable.toWeb(request), duplex: "half" });
      const reply = await worker.fetch(new Request(url, options), { DB: database });
      response.writeHead(reply.status, Object.fromEntries(reply.headers));
      response.end(Buffer.from(await reply.arrayBuffer()));
      return;
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { ...baseHeaders, Allow: "GET, HEAD" }).end();
      return;
    }
    const path = decodeURIComponent(url.pathname);
    const file = resolve(root, "." + (path === "/" ? "/index.html" : path));
    if (!file.startsWith(root + sep)) {
      response.writeHead(404, baseHeaders).end("Page not found.");
      return;
    }
    const bytes = await readFile(file);
    response.writeHead(200, { ...baseHeaders, "Content-Type": contentTypes[extname(file)] || "application/octet-stream" });
    response.end(request.method === "HEAD" ? undefined : bytes);
  } catch {
    response.writeHead(404, baseHeaders).end("Page not found.");
  }
}).listen(4173, "127.0.0.1", () => console.log("Local http://127.0.0.1:4173/"));
