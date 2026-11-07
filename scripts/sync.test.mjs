import assert from "node:assert/strict";
import { test } from "node:test";
import { createSyncClient, decryptSnapshot, encryptSnapshot } from "../shared/sync.mjs";
import { createLocalDatabase } from "./local-db.mjs";
import { createWorker } from "../worker/index.mjs";

const origin = "https://redact.test";
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
};

test("paired devices merge concurrent and offline checks, sync preferences, clear history, and revoke access", async () => {
  const db = createLocalDatabase();
  try {
    const worker = createWorker();
    const fetcher = (url, init) => worker.fetch(new Request(url, init), { DB: db });
    const pairingURL = "https://jalenkidd.github.io/Redact/";
    const laptop = createSyncClient({ baseURL: origin, pairingURL, storage: storage(), fetcher });
    let offline = false;
    const phoneStorage = storage();
    const phone = createSyncClient({ baseURL: origin, storage: phoneStorage, fetcher: (url, init) => {
      if (offline) return Promise.reject(new Error("Offline"));
      return fetcher(url, init);
    } });
    const other = createSyncClient({ baseURL: origin, storage: storage(), fetcher });
    await laptop.create("Laptop", "computer", { appearance: "aurora", compact: false });
    const invite = await laptop.invitation();
    assert.equal(invite.url, pairingURL + "#pair=" + invite.code);
    await phone.join(invite.url, "Phone", "phone");
    await assert.rejects(other.join(invite.code, "Other", "browser"), /already used/);
    const now = Date.now();
    const laptopCheck = { provider: "Manual check", timestamp: now, kinds: ["email"], draft: "RAW PROMPT MUST STAY LOCAL" };
    const phoneCheck = { provider: "ChatGPT", timestamp: now + 1, kinds: ["phone"] };
    await Promise.all([laptop.ingest([laptopCheck]), phone.ingest([phoneCheck])]);
    await Promise.all([laptop.sync(), phone.sync()]);
    await laptop.sync();
    await phone.sync();
    assert.deepEqual(laptop.status().summaries.map(summary => summary.score), [25, 20]);
    assert.deepEqual(phone.status().summaries, laptop.status().summaries);
    assert.deepEqual(Object.keys(laptop.status().summaries[1]).sort(), ["id", "kinds", "provider", "score", "timestamp"]);
    assert.equal(phone.status().devices.length, 2);
    await laptop.setPreference("appearance", "midnight");
    await laptop.sync();
    await phone.sync();
    assert.equal(phone.status().preferences.appearance.value, "midnight");

    offline = true;
    const offlineCheck = { provider: "Manual check", timestamp: now + 2, kinds: ["student", "email"] };
    await phone.ingest([offlineCheck]);
    await assert.rejects(phone.sync(), /Offline/);
    assert.equal(phone.status().phase, "offline");
    offline = false;
    await phone.sync();
    await laptop.sync();
    assert.equal(laptop.status().summaries[0].score, 45);

    const persisted = JSON.parse(phoneStorage.getItem("redact.sync.v1"));
    const cloud = await db.prepare("SELECT payload FROM sync_spaces WHERE id = ?").bind(persisted.credentials.spaceId).first();
    assert.match(cloud.payload, /^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    assert.ok(!cloud.payload.includes("RAW PROMPT"));
    const decrypted = await decryptSnapshot(cloud.payload, persisted.credentials.key, persisted.credentials.spaceId);
    assert.equal(decrypted.records.length, 3);
    await assert.rejects(decryptSnapshot(cloud.payload, persisted.credentials.key, "other-space"), /could not decrypt/);
    assert.notEqual(await encryptSnapshot(decrypted, persisted.credentials.key, persisted.credentials.spaceId), cloud.payload);

    await laptop.clearHistory();
    await phone.ingest([phoneCheck, offlineCheck]);
    await phone.sync();
    assert.equal(phone.status().summaries.length, 0);
    await laptop.ingest([laptopCheck]);
    await laptop.sync();
    assert.equal(laptop.status().summaries.length, 0);
    await phone.rename("My phone");
    await laptop.sync();
    assert.ok(laptop.status().devices.some(device => device.name === "My phone"));
    await laptop.remove(phone.status().deviceId);
    await assert.rejects(phone.sync(), /disconnected/);
    assert.equal(phone.status().connected, false);
    assert.equal(phone.status().devices.length, 0);
    assert.equal((await fetcher(origin + "/api/sync/state", {})).status, 401);
    assert.equal((await fetcher(origin + "/api/sync/state", { headers: { origin: "https://wrong.test" } })).status, 403);
  } finally {
    db.close();
  }
});
