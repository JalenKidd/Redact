import "./scanner.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const STORAGE_KEY = "redact.sync.v1";
const validId = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const emptySnapshot = () => ({ records: [], deleted: [], preferences: {} });
const encode64 = bytes => btoa(Array.from(bytes, value => String.fromCharCode(value)).join(""));
const decode64 = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));

export function cleanSummary(summary) {
  if (!summary || !["Manual check", "ChatGPT"].includes(summary.provider) ||
      !Number.isFinite(summary.timestamp) || Math.abs(summary.timestamp) > 8.64e15 || !Array.isArray(summary.kinds)) return null;
  const kinds = [...new Set(summary.kinds.filter(kind => typeof kind === "string" && Object.hasOwn(Redact.categories, kind)))].sort();
  return {
    provider: summary.provider, timestamp: summary.timestamp, kinds,
    score: Math.min(100, kinds.reduce((total, kind) => total + Redact.categories[kind].points, 0)),
  };
}

export async function summaryId(summary) {
  const clean = cleanSummary(summary);
  if (!clean) throw new Error("Invalid check summary.");
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(clean)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function cleanSnapshot(value) {
  if (!value || !Array.isArray(value.records) || !Array.isArray(value.deleted) ||
      value.records.length > 500 || value.deleted.length > 8192) throw new Error("Invalid synced history.");
  const records = value.records.map(record => {
    const summary = cleanSummary(record);
    if (!summary || !validId(record.id)) throw new Error("Invalid synced check.");
    return { id: record.id, ...summary };
  });
  if (value.deleted.some(id => !validId(id))) throw new Error("Invalid history deletion.");
  const preferences = {};
  for (const name of ["appearance", "compact"]) {
    const setting = value.preferences?.[name];
    if (!setting) continue;
    const validValue = name === "appearance" ? ["aurora", "midnight"].includes(setting.value) : typeof setting.value === "boolean";
    if (!validValue || !Number.isSafeInteger(setting.clock) || setting.clock < 0 || typeof setting.device !== "string") {
      throw new Error("Invalid synced preference.");
    }
    preferences[name] = { value: setting.value, clock: setting.clock, device: setting.device.slice(0, 64) };
  }
  return { records, deleted: [...new Set(value.deleted)].sort(), preferences };
}

export function mergeSnapshots(first, second) {
  const deleted = [...new Set([...first.deleted, ...second.deleted])].sort();
  if (deleted.length > 8192) throw new Error("This sync space has reached its history limit.");
  const removed = new Set(deleted);
  const records = [...new Map([...first.records, ...second.records].map(record => [record.id, record])).values()]
    .filter(record => !removed.has(record.id))
    .sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id)).slice(0, 500);
  const preferences = { ...first.preferences };
  for (const [name, setting] of Object.entries(second.preferences)) {
    const previous = preferences[name];
    if (!previous || setting.clock > previous.clock || (setting.clock === previous.clock && setting.device > previous.device)) preferences[name] = setting;
  }
  return { records, deleted, preferences };
}

async function keyFrom(raw) {
  return crypto.subtle.importKey("raw", decode64(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSnapshot(snapshot, key, space) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(space) },
    await keyFrom(key), encoder.encode(JSON.stringify(snapshot)));
  return encode64(iv) + ":" + encode64(new Uint8Array(bytes));
}

export async function decryptSnapshot(payload, key, space) {
  if (!payload) return emptySnapshot();
  const [nonce, ciphertext] = payload.split(":");
  const iv = decode64(nonce);
  if (iv.length !== 12 || !ciphertext) throw new Error("Invalid encrypted history.");
  try {
    const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(space) }, await keyFrom(key), decode64(ciphertext));
    return cleanSnapshot(JSON.parse(decoder.decode(bytes)));
  } catch {
    throw new Error("This device could not decrypt the synced history. Pair it again.");
  }
}

export function createSyncClient({ baseURL, storage = localStorage, fetcher = fetch }) {
  const base = new URL(baseURL).origin;
  let state = { credentials: null, snapshot: emptySnapshot(), name: "", kind: "browser", lastSynced: null };
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY));
    if (saved) {
      state = { ...state, ...saved, snapshot: cleanSnapshot(saved.snapshot) };
      if (state.credentials?.base !== base) state = { ...state, credentials: null, snapshot: emptySnapshot() };
    }
  } catch {}
  let phase = state.credentials ? "offline" : "local";
  let error = "";
  let devices = [];
  let pending = Promise.resolve();
  let syncing = null;
  const listeners = new Set();
  const emit = () => listeners.forEach(listener => listener(status()));
  const persist = () => storage.setItem(STORAGE_KEY, JSON.stringify(state));
  const queue = operation => {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  };
  function status() {
    return {
      connected: !!state.credentials, phase, error, lastSynced: state.lastSynced,
      devices, deviceId: state.credentials?.deviceId, name: state.name,
      summaries: state.snapshot.records, preferences: state.snapshot.preferences,
    };
  }
  async function request(path, options = {}, authenticated = true) {
    const headers = { "Content-Type": "application/json" };
    if (authenticated) headers.Authorization = "Bearer " + state.credentials?.token;
    const response = await fetcher(base + "/api/sync" + path, {
      ...options, headers, credentials: "omit", signal: AbortSignal.timeout(12_000),
    });
    let data;
    try { data = await response.json(); } catch { throw new Error("The sync service could not be reached."); }
    if (!response.ok) {
      const failure = new Error(data.error || "The sync service could not complete this request.");
      failure.status = response.status;
      throw failure;
    }
    return data;
  }
  async function synchronize() {
    if (!state.credentials) return status();
    phase = "syncing";
    error = "";
    emit();
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const remote = await request("/state");
        const snapshot = await decryptSnapshot(remote.payload, state.credentials.key, state.credentials.spaceId);
        const merged = mergeSnapshots(snapshot, state.snapshot);
        state.snapshot = merged;
        persist();
        let result = remote;
        if (JSON.stringify(merged) !== JSON.stringify(snapshot) || !remote.payload) {
          const payload = await encryptSnapshot(merged, state.credentials.key, state.credentials.spaceId);
          try {
            result = await request("/state", { method: "PUT", body: JSON.stringify({ version: remote.version, payload }) });
          } catch (failure) {
            if (failure.status === 409) continue;
            throw failure;
          }
        }
        devices = Array.isArray(result.devices) ? result.devices : [];
        const self = devices.find(device => device.id === state.credentials.deviceId);
        if (self) state.name = self.name;
        state.lastSynced = Date.now();
        phase = "synced";
        persist();
        emit();
        return status();
      }
      throw new Error("Other devices are updating. Try syncing again.");
    } catch (failure) {
      error = failure.message;
      phase = failure.status === 401 ? "disconnected" : "offline";
      if (failure.status === 401) {
        state.credentials = null;
        state.lastSynced = null;
        devices = [];
      }
      persist();
      emit();
      throw failure;
    }
  }

  function sync() {
    if (!syncing) syncing = queue(synchronize).finally(() => { syncing = null; });
    return syncing;
  }

  return Object.freeze({
    status,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async create(name, kind, preferences = {}) {
      return queue(async () => {
        if (state.credentials) throw new Error("This device is already connected.");
        const credentials = await request("/spaces", { method: "POST", body: JSON.stringify({ name, kind }) }, false);
        const key = encode64(crypto.getRandomValues(new Uint8Array(32)));
        state = { credentials: { ...credentials, key, base }, snapshot: emptySnapshot(), name, kind, lastSynced: null };
        for (const [field, value] of Object.entries(preferences)) {
          if (["appearance", "compact"].includes(field)) state.snapshot.preferences[field] = { value, clock: 1, device: credentials.deviceId };
        }
        persist();
        return synchronize();
      });
    },
    async join(code, name, kind) {
      return queue(async () => {
        if (state.credentials) throw new Error("Disconnect this device before pairing it to another space.");
        let invitation;
        try {
          let value = code.trim();
          if (value.startsWith("https://") || value.startsWith("http://")) value = new URL(value).hash.slice("#pair=".length);
          if (value.startsWith("RD1.")) value = value.slice(4);
          invitation = JSON.parse(decoder.decode(decode64(value.replace(/-/g, "+").replace(/_/g, "/"))));
          if (invitation.base !== base || typeof invitation.invitation !== "string" || decode64(invitation.key).length !== 32) throw new Error();
        } catch { throw new Error("Paste a valid Redact pairing code from your other device."); }
        const credentials = await request("/join", { method: "POST", body: JSON.stringify({ invitation: invitation.invitation, name, kind }) }, false);
        state = { credentials: { ...credentials, key: invitation.key, base }, snapshot: emptySnapshot(), name, kind, lastSynced: null };
        persist();
        return synchronize();
      });
    },
    sync,
    ingest(summaries) {
      return queue(async () => {
        if (!state.credentials) return;
        const records = [];
        for (const source of summaries.slice(0, 400)) {
          const summary = cleanSummary(source);
          if (summary) records.push({ id: await summaryId(summary), ...summary });
        }
        const merged = mergeSnapshots(state.snapshot, { records, deleted: [], preferences: {} });
        if (JSON.stringify(merged) === JSON.stringify(state.snapshot)) return;
        state.snapshot = merged;
        persist();
        emit();
      });
    },
    invitation() {
      return queue(async () => {
        if (!state.credentials) throw new Error("Enable sync on this device first.");
        const result = await request("/invitations", { method: "POST", body: "{}" });
        const content = { base, invitation: result.invitation, key: state.credentials.key };
        const code = "RD1." + encode64(encoder.encode(JSON.stringify(content))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
        return { code, expires: result.expires, url: base + "/#pair=" + code };
      });
    },
    rename(name) {
      return queue(async () => {
        await request("/devices/" + state.credentials?.deviceId, { method: "PATCH", body: JSON.stringify({ name }) });
        state.name = name;
        persist();
        return synchronize();
      });
    },
    remove(id) {
      return queue(async () => {
        await request("/devices/" + id, { method: "DELETE" });
        if (id === state.credentials?.deviceId) {
          state.credentials = null;
          state.snapshot = emptySnapshot();
          state.lastSynced = null;
          phase = "local";
          devices = [];
          persist();
          emit();
          return status();
        }
        return synchronize();
      });
    },
    clearHistory() {
      return queue(async () => {
        if (!state.credentials) throw new Error("This device is not connected.");
        await synchronize();
        state.snapshot.deleted = [...new Set([...state.snapshot.deleted, ...state.snapshot.records.map(record => record.id)])].sort();
        state.snapshot.records = [];
        persist();
        return synchronize();
      });
    },
    setPreference(name, value) {
      return queue(async () => {
        if (!["appearance", "compact"].includes(name)) throw new Error("Unknown preference.");
        const previous = state.snapshot.preferences[name];
        state.snapshot.preferences[name] = {
          value, clock: (previous?.clock || 0) + 1, device: state.credentials?.deviceId || "local",
        };
        state.snapshot = cleanSnapshot(state.snapshot);
        persist();
        emit();
      });
    },
  });
}
