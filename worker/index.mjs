const MAX_BODY = 750_000;
const encoder = new TextEncoder();
const appOrigin = typeof __REDACT_ORIGIN__ === "undefined" ? null : __REDACT_ORIGIN__;
const pagesOrigin = typeof __REDACT_PAGES_ORIGIN__ === "undefined" ? null : __REDACT_PAGES_ORIGIN__;
const extensionOrigin = typeof __REDACT_EXTENSION_ORIGIN__ === "undefined" ? null : __REDACT_EXTENSION_ORIGIN__;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
};
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))),
  byte => byte.toString(16).padStart(2, "0")).join("");

function validateName(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 48 || /[\x00-\x1f]/.test(value)) {
    throw new HttpError(400, "Choose a device name of up to 48 characters.");
  }
  return value.trim();
}

function validateKind(value) {
  if (!["computer", "phone", "tablet", "browser"].includes(value)) throw new HttpError(400, "Unknown device type.");
  return value;
}

async function body(request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY) throw new HttpError(413, "Sync payload is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "A request body is required.");
  let size = 0;
  const chunks = [];
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel();
      throw new HttpError(413, "Sync payload is too large.");
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  }
  catch { throw new HttpError(400, "Invalid JSON request."); }
}

async function authenticate(request, db) {
  const token = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) throw new HttpError(401, "This device is not connected.");
  const tokenHash = await hash(token);
  const device = await db.prepare("SELECT * FROM sync_devices WHERE token_hash = ?").bind(tokenHash).first();
  if (!device) throw new HttpError(401, "This device was disconnected. Pair it again to sync.");
  return device;
}

async function throttle(request, db, scope, maximum) {
  const now = Date.now();
  const window = Math.floor(now / 3_600_000);
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const key = await hash(scope + ":" + ip + ":" + window);
  const entry = await db.prepare("INSERT INTO sync_limits (key, count, expires) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count")
    .bind(key, (window + 2) * 3_600_000).first();
  if (entry.count > maximum) throw new HttpError(429, "Too many pairing requests. Try again later.");
  await db.prepare("DELETE FROM sync_limits WHERE expires < ?").bind(now).run();
}

async function stateFor(device, db) {
  await db.prepare("UPDATE sync_devices SET last_seen = ? WHERE id = ?").bind(Date.now(), device.id).run();
  const space = await db.prepare("SELECT version, payload FROM sync_spaces WHERE id = ?").bind(device.space_id).first();
  if (!space) throw new HttpError(401, "This sync space is unavailable.");
  const devices = await db.prepare("SELECT id, name, kind, last_seen AS lastSeen FROM sync_devices WHERE space_id = ? ORDER BY last_seen DESC")
    .bind(device.space_id).all();
  return { ...space, devices: devices.results, deviceId: device.id, serverTime: Date.now() };
}

async function api(request, env) {
  const db = env.DB;
  if (!db) throw new HttpError(503, "The sync service is being configured. Try again shortly.");
  const path = new URL(request.url).pathname;

  if (path === "/api/sync/spaces" && request.method === "POST") {
    await throttle(request, db, "create", 20);
    const data = await body(request);
    const name = validateName(data.name);
    const kind = validateKind(data.kind);
    const id = crypto.randomUUID();
    const deviceId = crypto.randomUUID();
    const token = randomToken();
    await db.batch([
      db.prepare("INSERT INTO sync_spaces (id) VALUES (?)").bind(id),
      db.prepare("INSERT INTO sync_devices (id, space_id, token_hash, name, kind, last_seen) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(deviceId, id, await hash(token), name, kind, Date.now()),
    ]);
    return { spaceId: id, deviceId, token };
  }

  if (path === "/api/sync/join" && request.method === "POST") {
    await throttle(request, db, "join", 60);
    const data = await body(request);
    const name = validateName(data.name);
    const kind = validateKind(data.kind);
    if (typeof data.invitation !== "string" || !/^[a-f0-9]{64}$/.test(data.invitation)) throw new HttpError(400, "The pairing code is invalid.");
    const invitation = await hash(data.invitation);
    const id = crypto.randomUUID();
    const token = randomToken();
    const now = Date.now();
    const results = await db.batch([
      db.prepare("INSERT INTO sync_devices (id, space_id, token_hash, name, kind, last_seen) SELECT ?, i.space_id, ?, ?, ?, ? FROM sync_invitations i WHERE i.token_hash = ? AND i.expires > ? AND i.consumed = 0 AND (SELECT count(*) FROM sync_devices WHERE space_id = i.space_id) < 8")
        .bind(id, await hash(token), name, kind, now, invitation, now),
      db.prepare("UPDATE sync_invitations SET consumed = 1 WHERE token_hash = ? AND EXISTS (SELECT 1 FROM sync_devices WHERE id = ? AND space_id = sync_invitations.space_id)")
        .bind(invitation, id),
    ]);
    if (results[0].meta.changes !== 1) throw new HttpError(409, "That code expired, was already used, or the eight-device limit was reached.");
    const device = await db.prepare("SELECT space_id FROM sync_devices WHERE id = ?").bind(id).first();
    return { spaceId: device.space_id, deviceId: id, token };
  }

  const device = await authenticate(request, db);
  if (path === "/api/sync/state" && request.method === "GET") return stateFor(device, db);
  if (path === "/api/sync/activity" && request.method === "GET") {
    const activity = await db.prepare("SELECT activity_version AS version, activity_payload AS payload FROM sync_spaces WHERE id = ?")
      .bind(device.space_id).first();
    if (!activity) throw new HttpError(401, "This sync space is unavailable.");
    return { ...activity, serverTime: Date.now() };
  }
  if (path === "/api/sync/activity" && request.method === "PUT") {
    const data = await body(request);
    if (!Number.isSafeInteger(data.version) || data.version < 0 || typeof data.payload !== "string" ||
        data.payload.length > 20_000 || !/^[A-Za-z0-9+/]{16}:[A-Za-z0-9+/]+={0,2}$/.test(data.payload)) {
      throw new HttpError(400, "Invalid encrypted activity.");
    }
    const updated = await db.prepare("UPDATE sync_spaces SET activity_payload = ?, activity_version = activity_version + 1 WHERE id = ? AND activity_version = ? AND EXISTS (SELECT 1 FROM sync_devices WHERE id = ? AND token_hash = ?)")
      .bind(data.payload, device.space_id, data.version, device.id, device.token_hash).run();
    if (updated.meta.changes !== 1) throw new HttpError(409, "Another device updated redaction activity. Merge and retry.");
    await db.prepare("UPDATE sync_devices SET last_seen = ? WHERE id = ?").bind(Date.now(), device.id).run();
    return { saved: true };
  }
  if (path === "/api/sync/state" && request.method === "PUT") {
    const data = await body(request);
    if (!Number.isSafeInteger(data.version) || data.version < 0 || typeof data.payload !== "string" ||
        data.payload.length > 700_000 || !/^[A-Za-z0-9+/]{16}:[A-Za-z0-9+/]+={0,2}$/.test(data.payload)) {
      throw new HttpError(400, "Invalid encrypted sync payload.");
    }
    const result = await db.prepare("UPDATE sync_spaces SET payload = ?, version = version + 1 WHERE id = ? AND version = ? AND EXISTS (SELECT 1 FROM sync_devices WHERE id = ? AND token_hash = ?)")
      .bind(data.payload, device.space_id, data.version, device.id, device.token_hash).run();
    if (result.meta.changes !== 1) throw new HttpError(409, "Another device updated this space. Merge and retry.");
    return stateFor(device, db);
  }
  if (path === "/api/sync/invitations" && request.method === "POST") {
    const token = randomToken();
    const expires = Date.now() + 600_000;
    await db.batch([
      db.prepare("DELETE FROM sync_invitations WHERE expires < ? OR (space_id = ? AND consumed = 0)").bind(Date.now(), device.space_id),
      db.prepare("INSERT INTO sync_invitations (token_hash, space_id, expires) VALUES (?, ?, ?)").bind(await hash(token), device.space_id, expires),
    ]);
    return { invitation: token, expires };
  }
  const deviceId = path.match(/^\/api\/sync\/devices\/([a-f0-9-]{36})$/)?.[1];
  if (deviceId && request.method === "PATCH") {
    if (deviceId !== device.id) throw new HttpError(403, "Rename this device from its own app.");
    const data = await body(request);
    await db.prepare("UPDATE sync_devices SET name = ? WHERE id = ?").bind(validateName(data.name), deviceId).run();
    return stateFor(device, db);
  }
  if (deviceId && request.method === "DELETE") {
    await db.batch([
      db.prepare("DELETE FROM sync_devices WHERE id = ? AND space_id = ?").bind(deviceId, device.space_id),
      db.prepare("DELETE FROM sync_spaces WHERE id = ? AND NOT EXISTS (SELECT 1 FROM sync_devices WHERE space_id = ?)").bind(device.space_id, device.space_id),
    ]);
    return { removed: true };
  }
  throw new HttpError(404, "Sync endpoint not found.");
}

export function createWorker(assets = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/api/")) {
        const asset = assets[url.pathname === "/" ? "/index.html" : url.pathname];
        if (!asset || !["GET", "HEAD"].includes(request.method)) return new Response("Page not found", { status: 404 });
        const bytes = Uint8Array.from(atob(asset.body), value => value.charCodeAt(0));
        return new Response(request.method === "HEAD" ? null : bytes, { headers: {
          "Content-Type": asset.type, "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        } });
      }
      const origin = request.headers.get("origin");
      const permitted = !origin || [url.origin, appOrigin, pagesOrigin, extensionOrigin, "redact://app", "http://127.0.0.1:4173"].includes(origin);
      const headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": permitted && origin ? origin : url.origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin",
      };
      try {
        if (!permitted) throw new HttpError(403, "This app origin is not allowed.");
        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
        const data = await api(request, env);
        return Response.json(data, { headers });
      } catch (error) {
        const known = error instanceof HttpError;
        return Response.json({ error: known ? error.message : "Sync is temporarily unavailable. Try again." },
          { status: known ? error.status : 500, headers });
      }
    },
  };
}

export default createWorker(typeof __REDACT_ASSETS__ === "undefined" ? {} : __REDACT_ASSETS__);
