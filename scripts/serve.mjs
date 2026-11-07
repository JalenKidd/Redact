import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist", import.meta.url));
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
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { ...baseHeaders, Allow: "GET, HEAD" }).end();
      return;
    }
    const path = decodeURIComponent(new URL(request.url, "http://127.0.0.1:4173").pathname);
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
