globalThis.RedactChromeActivity = (() => {
  const alarmName = "redact-usage-retry";
  let database;
  let pending = Promise.resolve();

  function open() {
    if (!database) {
      database = new Promise((resolve, reject) => {
        const request = indexedDB.open("redact-chrome-usage", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("usage");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).catch(error => {
        database = null;
        throw error;
      });
    }
    return database;
  }

  async function access(mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("usage", mode);
      const request = operation(transaction.objectStore("usage"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  const read = async () => (await access("readonly", store => store.get("sync"))) || { client: null, events: [], lastSynced: null };
  const write = value => access("readwrite", store => store.put(value, "sync"));

  function makeClient(state) {
    return RedactSync.createSyncClient({
      baseURL: RedactConfig.syncUrl,
      storage: {
        getItem: () => state.client,
        setItem: (_, value) => { state.client = value; },
      },
    });
  }

  function queued(operation) {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  }

  async function alarm(needed) {
    if (!needed) await chrome.alarms.clear(alarmName);
    else if (!(await chrome.alarms.get(alarmName))) await chrome.alarms.create(alarmName, { periodInMinutes: 1 });
  }

  function flush() {
    return queued(async () => {
      const state = await read();
      const client = makeClient(state);
      if (!client.status().connected || !state.events.length) {
        await alarm(false);
        return;
      }
      try {
        await client.syncActivity(state.events);
        await write({ ...state, events: [], lastSynced: Date.now() });
        await alarm(false);
      } catch (error) {
        if (error.status === 401) {
          await write({ client: null, events: [], lastSynced: null });
          await alarm(false);
        } else {
          await alarm(true);
        }
      }
    });
  }

  const retry = () => { void flush().catch(() => {}); };
  chrome.alarms.onAlarm.addListener(event => { if (event.name === alarmName) retry(); });
  chrome.runtime.onStartup.addListener(retry);
  chrome.runtime.onInstalled.addListener(retry);

  return Object.freeze({
    status() {
      return queued(async () => {
        const state = await read();
        return {
          linked: makeClient(state).status().connected,
          pending: state.events.length,
          lastSynced: state.lastSynced,
        };
      });
    },
    link(code) {
      return queued(async () => {
        const state = await read();
        const client = makeClient(state);
        await client.join(code, "Chrome extension", "browser", { activityOnly: true });
        await write({ client: state.client, events: [], lastSynced: null });
      });
    },
    disconnect() {
      return queued(async () => {
        const state = await read();
        const client = makeClient(state);
        const { deviceId } = client.status();
        await write({ client: null, events: [], lastSynced: null });
        await alarm(false);
        try {
          if (deviceId) await client.remove(deviceId);
          return { revoked: true };
        } catch (error) {
          return { revoked: error.status === 401 };
        }
      });
    },
    record(event) {
      return queued(async () => {
        const state = await read();
        if (!makeClient(state).status().connected) return false;
        state.events = RedactSync.mergeActivity({ events: [event] }, state).events;
        await write(state);
        await alarm(true);
        return true;
      }).then(recorded => {
        if (recorded) retry();
        return recorded;
      });
    },
  });
})();
