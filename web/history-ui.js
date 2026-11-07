(() => {
  const $ = id => document.getElementById(id);
  const el = (tag, text, className) => {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = String(text);
    if (className) item.className = className;
    return item;
  };
  const action = (title, handler, className = "secondary-button") => {
    const item = el("button", title, className); item.type = "button"; item.addEventListener("click", handler); return item;
  };
  const scoreLabel = row => !row.result ? "Not scored" : `${row.coverage === "partial" ? "≥ " : ""}${row.result.score}/100`;
  const date = timestamp => timestamp === null ? "Unknown date" : new Date(timestamp).toLocaleString();

  function init({ openDialog, openDraft }) {
    let worker = null, generation = 0, imported = null, preview = null, page = 0;
    let selected = new Set();
    const pageSize = 25;
    const stopWorker = () => { generation++; worker?.terminate(); worker = null; };
    const status = text => { $("import-status").textContent = text; };
    const idle = () => {
      $("import-cancel").hidden = true;
      $("import-progress").hidden = true;
      $("import-analyze").disabled = false;
      $("history-files").value = "";
    };
    const cancel = () => {
      stopWorker(); preview = null; selected.clear();
      $("import-preview").hidden = true; $("import-conversations").replaceChildren();
      idle(); status(imported ? "Import cancelled. Previous imported results remain in memory." : "Import cancelled. No export is loaded.");
    };
    function clear() {
      stopWorker(); imported = null; preview = null; selected.clear(); page = 0;
      for (const id of ["import-conversations", "import-stats", "import-categories", "import-trends", "import-table", "import-preview-summary", "import-warnings", "import-page", "import-coverage"]) $(id).replaceChildren();
      $("import-category").replaceChildren(new Option("All categories", "all"));
      $("import-filter").value = "all"; $("import-sort").value = "score";
      $("import-results").hidden = $("import-preview").hidden = $("import-clear").hidden = true;
      $("modal").close(); $("modal-content").replaceChildren();
      idle(); status("Imported history cleared from this session. Provider originals, saved summaries, and any draft you opened in the scanner are separate.");
    }
    function showPreview(value) {
      preview = value;
      selected = new Set(value.conversations.filter(c => c.prompts).map(c => c.id));
      const stats = value.stats;
      $("import-preview-summary").textContent = `${stats.files} file(s), ${stats.conversations} conversations and ${stats.prompts} unique user prompts. ${stats.otherMessages} assistant, system or other messages excluded.`;
      $("import-warnings").textContent = [
        stats.partial ? `${stats.partial} prompts have unscanned attachments or parts.` : "",
        stats.unsupported ? `${stats.unsupported} prompts cannot receive a full score (including ${stats.oversized} oversized prompts).` : "",
        stats.malformed ? `${stats.malformed} malformed conversations or nodes skipped.` : "",
        stats.duplicates ? `${stats.duplicates} duplicate prompts excluded.` : "",
        stats.conflicts ? `${stats.conflicts} changed prompts with repeated IDs excluded; the first copy was kept.` : "",
        stats.branchWarnings ? `${stats.branchWarnings} invalid branch paths; branch labels may be unknown.` : "",
        "Current and alternate exported branches are included. Review the selection before analyzing.",
      ].filter(Boolean).join(" ");
      renderSelection(); $("import-preview").hidden = false;
      $("import-progress").hidden = true;
      $("import-analyze").disabled = !selected.size;
      status("Preview ready. Nothing has been added to saved history. Confirm the conversations to analyze.");
    }
    function renderSelection() {
      $("import-conversations").replaceChildren();
      for (const conversation of preview.conversations) {
        const label = el("label", undefined, "import-conversation");
        const check = el("input"); check.type = "checkbox"; check.checked = selected.has(conversation.id); check.disabled = !conversation.prompts;
        check.addEventListener("change", () => {
          if (check.checked) selected.add(conversation.id); else selected.delete(conversation.id);
          $("import-analyze").disabled = !selected.size;
        });
        label.append(check, el("span", `${conversation.title} — ${conversation.prompts} prompts (${conversation.unscanned} unscanned, ${conversation.partial} partial)`));
        $("import-conversations").append(label);
      }
    }
    function prepare(files) {
      stopWorker(); preview = null; selected.clear();
      $("import-preview").hidden = true; $("import-conversations").replaceChildren();
      $("import-cancel").hidden = false;
      $("import-progress").hidden = false; $("import-progress").removeAttribute("value");
      status("Reading and validating JSON locally… Previous results stay available until a new analysis completes.");
      const token = generation;
      try { worker = new Worker("history-worker.js"); }
      catch { idle(); status("The local import worker could not start. Reload the application and retry."); return; }
      worker.onerror = event => {
        event.preventDefault();
        if (token !== generation) return;
        stopWorker(); idle(); status("The import worker failed. Previous results remain available; try a smaller supported export.");
      };
      worker.onmessage = ({ data }) => {
        if (token !== generation) return;
        if (data.type === "preview") showPreview(data.preview);
        if (data.type === "progress") {
          $("import-progress").max = Math.max(1, data.progress.total);
          $("import-progress").value = data.progress.completed;
          status(`Analyzed ${data.progress.completed} of ${data.progress.total} user prompts locally…`);
        }
        if (data.type === "error") {
          stopWorker(); idle(); preview = null;
          $("import-preview").hidden = true; $("import-conversations").replaceChildren();
          status(data.message + (imported ? " Previous imported results are still available." : ""));
        }
        if (data.type === "complete") {
          imported = data.result; page = 0; stopWorker(); idle(); preview = null; selected.clear();
          $("import-preview").hidden = true; $("import-conversations").replaceChildren();
          $("import-preview-summary").replaceChildren(); $("import-warnings").replaceChildren();
          $("import-filter").value = "all"; $("import-sort").value = "score";
          renderResults();
          status(`${imported.rows.length} imported user prompts reviewed. Results are memory-only and use local rules; no AI or provider requests were made.`);
        }
      };
      worker.postMessage({ type: "prepare", files });
    }

    function inspect(row) {
      const description = el("p", `${row.title} · ${date(row.timestamp)} · ${row.branch} branch · ${scoreLabel(row)}`);
      const coverage = el("p", row.warning || "Full exported text received a local rules scan. Contextual AI and conversation-wide identity linking were not run.");
      const text = el("pre", undefined, "import-prompt-text");
      let offset = 0;
      for (const match of row.result?.matches || []) {
        text.append(document.createTextNode(row.text.slice(offset, match.start)));
        const mark = el("mark", row.text.slice(match.start, match.end));
        mark.title = Redact.categories[match.kind].label; text.append(mark); offset = match.end;
      }
      text.append(document.createTextNode(row.text.slice(offset) || (!row.text ? "No supported text to display." : "")));
      const reasons = el("ul");
      for (const reason of row.result?.reasons || []) reasons.append(el("li", `${reason.label}: +${reason.points}, ${reason.count} occurrence(s). Each category is counted once.`));
      const controls = el("div", undefined, "dialog-actions");
      if (row.text.trim() && !row.truncated) controls.append(action("Open in prompt scanner", () => {
        $("modal").close(); $("modal-content").replaceChildren(); openDraft(row.text);
      }, "primary-button"));
      openDialog("IMPORTED USER PROMPT / LOCAL RULES", "Review detected details", description, coverage, text, reasons, controls);
    }
    function renderResults() {
      if (!imported) return;
      $("import-results").hidden = false; $("import-clear").hidden = false;
      const summary = imported.summary;
      $("import-stats").replaceChildren();
      for (const [label, value] of [["User prompts", summary.total], ["Full text scans", summary.complete], ["Partial scans", summary.partial],
        ["Unscanned prompts", summary.unscanned], ["Mean full-text score", summary.mean === null ? "—" : summary.mean + "/100"], ["Detected score 50+", summary.high]]) {
        const stat = el("div", undefined, "stat"); stat.append(el("span", label, "stat-label"), el("strong", value, "stat-value")); $("import-stats").append(stat);
      }
      const stats = imported.importStats;
      $("import-coverage").textContent = `Scanner ${summary.version}. Rules-only analysis of ${imported.conversationCount} selected conversations, including alternate branches. Partial scores are lower-bound detected exposure (≥); partial and unscanned prompts are excluded from the mean. Export exclusions: ${stats.malformed} malformed records, ${stats.duplicates} duplicates, ${stats.conflicts} conflicting copies (first kept). No conversation-wide identity linking. Zero means no detected signals.`;
      $("import-categories").replaceChildren();
      $("import-category").replaceChildren(new Option("All categories", "all"));
      for (const category of summary.categories) {
        $("import-categories").append(el("span", `${category.label}: ${category.count} prompt(s)`, "reason-chip"));
        $("import-category").append(new Option(category.label, category.kind));
      }
      const trends = el("table", undefined, "history-table");
      const header = el("tr");
      for (const title of ["Month (UTC)", "Prompts", "Mean full-text score"]) { const th = el("th", title); th.scope = "col"; header.append(th); }
      const head = el("thead"); head.append(header); trends.append(head);
      const body = el("tbody");
      for (const group of summary.months) {
        const tr = el("tr"); tr.append(el("td", group.month), el("td", group.prompts), el("td", group.mean === null ? "Not scored" : group.mean + "/100")); body.append(tr);
      }
      trends.append(body); $("import-trends").replaceChildren(trends);
      renderTable();
    }
    function renderTable() {
      if (!imported) return;
      const filter = $("import-filter").value, category = $("import-category").value, sort = $("import-sort").value;
      const rows = imported.rows.filter(row => (filter === "all" || filter === "unscanned" && !row.result ||
        filter === "partial" && row.coverage === "partial" || filter === "high" && row.result?.score >= 50 ||
        filter === "low" && row.result && row.result.score < 50) &&
        (category === "all" || row.result?.reasons.some(reason => reason.kind === category)));
      rows.sort((a, b) => (sort === "score" ? (b.result?.score ?? -1) - (a.result?.score ?? -1) : 0) ||
        (b.timestamp ?? -1) - (a.timestamp ?? -1) || a.title.localeCompare(b.title));
      const pages = Math.max(1, Math.ceil(rows.length / pageSize)); page = Math.min(page, pages - 1);
      const table = el("table", undefined, "history-table");
      const header = el("tr");
      for (const title of ["Conversation / date", "Detected exposure", "Coverage / categories", "Review"]) { const th = el("th", title); th.scope = "col"; header.append(th); }
      const head = el("thead"); head.append(header); table.append(head);
      const body = el("tbody");
      for (const row of rows.slice(page * pageSize, (page + 1) * pageSize)) {
        const tr = el("tr"), conversation = el("td"), score = el("td", scoreLabel(row));
        conversation.append(el("strong", row.title), el("small", date(row.timestamp) + " · " + row.branch + " branch"));
        const reasons = el("td", row.coverage === "complete" ? "Text scanned" : row.coverage === "partial" ? "Partial scan" : "Unscanned");
        for (const reason of row.result?.reasons || []) reasons.append(el("span", reason.label, "reason-chip"));
        const control = el("td"); control.append(action("Inspect prompt", () => inspect(row), "text-button"));
        tr.append(conversation, score, reasons, control); body.append(tr);
      }
      table.append(body); $("import-table").replaceChildren(rows.length ? table : el("p", "No imported prompts match these filters."));
      $("import-previous").disabled = page === 0; $("import-next").disabled = page >= pages - 1;
      $("import-page").textContent = `Page ${page + 1} of ${pages} · ${rows.length} prompts`;
    }

    $("history-files").addEventListener("change", event => { if (event.target.files.length) prepare([...event.target.files]); });
    $("import-cancel").addEventListener("click", cancel);
    $("import-clear").addEventListener("click", () => openDialog("IMPORTED HISTORY / MEMORY ONLY", "Clear imported history?",
      el("p", "This clears the imported history view, the pending import, and its findings from this session. Saved summaries and provider originals are separate. If you opened a prompt in the scanner, clear that separate draft there."),
      action("Cancel", () => $("modal").close()), action("Clear imported text", clear, "primary-button")));
    $("import-select-all").addEventListener("click", () => { selected = new Set(preview.conversations.filter(c => c.prompts).map(c => c.id)); renderSelection(); $("import-analyze").disabled = !selected.size; });
    $("import-select-none").addEventListener("click", () => { selected.clear(); renderSelection(); $("import-analyze").disabled = true; });
    $("import-analyze").addEventListener("click", () => {
      if (!worker || !preview || !selected.size) return;
      $("import-preview").hidden = true; $("import-analyze").disabled = true;
      $("import-progress").hidden = false; $("import-progress").value = 0; $("import-progress").max = 1;
      status("Analyzing selected user prompts with local rules…");
      worker.postMessage({ type: "analyze", selectedIds: [...selected] });
    });
    for (const id of ["import-filter", "import-category", "import-sort"]) $(id).addEventListener("change", () => { page = 0; renderTable(); });
    $("import-previous").addEventListener("click", () => { page--; renderTable(); });
    $("import-next").addEventListener("click", () => { page++; renderTable(); });
    window.addEventListener("pagehide", stopWorker);
  }
  globalThis.RedactHistoryUI = Object.freeze({ init });
})();
