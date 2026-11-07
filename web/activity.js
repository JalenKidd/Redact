globalThis.RedactActivity = Object.freeze({
  init({ sync, notify, openDialog, isDemo }) {
    const storageKey = "redact.activity.v1";
    const { cleanActivity, mergeActivity, activityProviderName } = RedactSync;
    const section = document.getElementById("redaction-activity");
    const keep = document.getElementById("activity-keep");
    const list = document.getElementById("activity-items");
    const status = document.getElementById("activity-status");
    const clear = document.getElementById("activity-clear");
    const messageTotal = document.getElementById("activity-message-total");
    const detailTotal = document.getElementById("activity-detail-total");
    const draftTotal = document.getElementById("activity-draft-total");
    const overviewMessages = document.getElementById("overview-message-total");
    const overviewDetails = document.getElementById("overview-detail-total");
    const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
    const number = new Intl.NumberFormat();
    const startedAt = Date.now();
    let saved = mergeActivity();
    let enabledSince = 0;
    let session = mergeActivity();
    let remote = mergeActivity();
    let workspaceId;
    let pending = Promise.resolve();
    let syncError = false;
    const noticed = new Set();

    try {
      const stored = JSON.parse(localStorage.getItem(storageKey));
      if (stored) {
        saved = mergeActivity(stored);
        enabledSince = Number.isSafeInteger(stored.enabledSince) && stored.enabledSince > 0 ? stored.enabledSince : 0;
      }
    } catch {}
    keep.checked = Boolean(enabledSince);

    function persist() {
      try { localStorage.setItem(storageKey, JSON.stringify({ ...saved, enabledSince })); }
      catch { notify("This device couldn’t save redaction alert settings."); }
    }

    function title(event) {
      return event.kind === "chat-sent" ? "Redacted message sent" : "Draft redacted";
    }

    function detail(event) {
      return event.count + (event.count === 1 ? " private detail replaced" : " private details replaced");
    }

    function visible() {
      return mergeActivity({ events: mergeActivity(saved, session).events }, { events: remote.events }).events;
    }

    function showTotal(element, total) {
      const text = number.format(total);
      if (element.textContent === text) return;
      element.textContent = text;
      if (element.getClientRects().length) RedactMotion.reveal(element);
    }

    function render() {
      section.hidden = isDemo();
      const events = visible();
      const messages = events.filter(event => event.kind === "chat-sent");
      const details = messages.reduce((total, event) => total + event.count, 0);
      for (const element of [messageTotal, overviewMessages]) showTotal(element, messages.length);
      for (const element of [detailTotal, overviewDetails]) showTotal(element, details);
      showTotal(draftTotal, events.length - messages.length);
      clear.hidden = events.length === 0;
      list.hidden = events.length === 0;
      status.textContent = syncError ? "Alerts couldn’t sync. Redact will try again while it’s open."
        : events.length ? (sync.status().connected ? "Totals cover up to 60 recent alerts across linked devices." : "Totals cover up to 60 recent alerts on this device.")
        : "Redactions will appear here when you apply them.";
      list.replaceChildren(...events.slice(0, 6).map(event => {
        const row = document.createElement("li");
        const description = document.createElement("div");
        const heading = document.createElement("strong");
        const subtitle = document.createElement("p");
        const time = document.createElement("time");
        heading.textContent = title(event);
        subtitle.textContent = activityProviderName(event.provider) + " · " + detail(event);
        time.dateTime = new Date(event.timestamp).toISOString();
        time.textContent = date.format(event.timestamp);
        description.append(heading, subtitle);
        row.append(description, time);
        return row;
      }));
    }

    function announce(events) {
      if (document.visibilityState !== "visible" || isDemo()) return;
      const latest = events.find(event => event.timestamp >= startedAt && !noticed.has(event.id));
      for (const event of events) noticed.add(event.id);
      while (noticed.size > 180) noticed.delete(noticed.values().next().value);
      if (latest) notify(title(latest) + ". " + detail(latest) + ".");
    }

    function queued(operation) {
      const result = pending.then(operation);
      pending = result.catch(() => {});
      return result;
    }

    function refresh(extensionSummaries = []) {
      return queued(async () => {
        if (isDemo()) return;
        if (enabledSince && Array.isArray(extensionSummaries)) {
          const events = extensionSummaries.slice(0, 200).map(summary => cleanActivity({
            id: summary?.redactionId, timestamp: summary?.timestamp, provider: "chatgpt", count: summary?.redactedCount, kind: "chat-sent",
          })).filter(event => event && event.timestamp >= enabledSince);
          const updated = mergeActivity(saved, { events, clearedAt: remote.clearedAt });
          if (JSON.stringify(updated) !== JSON.stringify(saved)) {
            saved = updated;
            persist();
          }
        }
        const current = sync.status();
        if (workspaceId !== current.deviceId) {
          workspaceId = current.deviceId;
          remote = mergeActivity();
        }
        syncError = false;
        if (current.connected) {
          try {
            const updated = await sync.syncActivity(enabledSince ? saved.events : []);
            if (sync.status().deviceId !== workspaceId) return;
            remote = updated;
            if (remote.clearedAt > saved.clearedAt) {
              saved = mergeActivity(saved, { clearedAt: remote.clearedAt });
              session = mergeActivity(session, { clearedAt: remote.clearedAt });
              persist();
            }
          } catch { syncError = true; }
        }
        announce(visible());
        render();
      });
    }

    keep.addEventListener("change", () => {
      enabledSince = keep.checked ? Date.now() : 0;
      persist();
      void refresh();
    });
    clear.addEventListener("click", () => {
      const description = document.createElement("p");
      description.textContent = sync.status().connected ? "Remove alerts from this device and your linked workspace." : "Remove redaction alerts from this device.";
      const confirm = document.createElement("button");
      confirm.className = "primary-button";
      confirm.type = "button";
      confirm.textContent = "Clear redaction alerts";
      confirm.addEventListener("click", async () => {
        confirm.disabled = true;
        try {
          await queued(async () => {
            remote = sync.status().connected ? await sync.syncActivity(visible(), true) : mergeActivity();
            const clearedAt = Math.max(Date.now(), remote.clearedAt, ...visible().map(event => event.timestamp));
            session = saved = mergeActivity({ clearedAt });
            persist();
            syncError = false;
            render();
          });
          confirm.closest("dialog").close();
          notify("Redaction alerts cleared.");
        } catch {
          confirm.disabled = false;
          notify("Couldn’t clear synced alerts. Try again when connected.");
        }
      });
      openDialog("REDACT / ALERTS", "Clear redaction alerts?", description, confirm);
    });

    render();
    return Object.freeze({
      refresh, render,
      isKeeping: () => Boolean(enabledSince),
      recordDraft(provider, count) {
        const event = cleanActivity({ id: crypto.randomUUID(), timestamp: Date.now(), kind: "draft-redacted", provider, count });
        if (!event || isDemo()) return;
        session = mergeActivity(session, { events: [event] });
        if (enabledSince) {
          saved = mergeActivity(saved, { events: [event] });
          persist();
        }
        announce([event]);
        render();
        if (enabledSince && sync.status().connected) void refresh();
      },
    });
  },
});
