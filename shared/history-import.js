(() => {
  const limits = Object.freeze({ bytes: 16 * 1024 * 1024, files: 20, conversations: 1000,
    nodes: 25000, prompts: 10000, text: 4000000, message: 20000 });
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const string = (value, fallback, max = 200) => typeof value === "string" && value.trim() ? value.slice(0, max) : fallback;
  const time = value => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 8640000000000 ? value * 1000 : null;
  const issue = message => { throw new Error(message); };

  function parseExports(files) {
    if (!Array.isArray(files) || !files.length || files.length > limits.files) issue("Choose between 1 and 20 conversation JSON files.");
    let bytes = 0, nodes = 0, promptCount = 0, textLength = 0, conversationCount = 0;
    const conversations = new Map();
    const stats = { files: files.length, conversations: 0, prompts: 0, malformed: 0, otherMessages: 0,
      unsupported: 0, partial: 0, oversized: 0, duplicates: 0, conflicts: 0, branchWarnings: 0 };
    for (const file of files) {
      if (typeof file.text !== "string") issue("The selected file could not be read as text.");
      bytes += new TextEncoder().encode(file.text).length;
      if (bytes > limits.bytes) issue("Choose at most 16 MiB of extracted JSON files at a time.");
      let parsed;
      try { parsed = JSON.parse(file.text.replace(/^\uFEFF/, "")); }
      catch { issue("A selected file is not valid JSON. Extract the export ZIP and choose its conversation JSON files."); }
      const entries = Array.isArray(parsed) ? parsed : object(parsed) && Array.isArray(parsed.conversations) ? parsed.conversations :
        object(parsed) && object(parsed.mapping) ? [parsed] : null;
      if (!entries) issue("Unsupported export format. Expected ChatGPT conversation objects with a message mapping.");
      conversationCount += entries.length;
      if (conversationCount > limits.conversations) issue("This import exceeds 1,000 conversation records. Choose a smaller export file or fewer numbered files.");
      for (const source of entries) {
        if (!object(source) || !object(source.mapping)) { stats.malformed++; continue; }
        const items = Object.entries(source.mapping);
        nodes += items.length;
        if (nodes > limits.nodes) issue("This import exceeds 25,000 message nodes. Choose fewer files.");
        const idValue = source.id ?? source.conversation_id;
        const id = typeof idValue === "string" && idValue.trim() && idValue.length <= 300 ? idValue : null;
        // IDs are necessary for reliable branch identity and deduplication.
        if (!id) { stats.malformed++; continue; }
        let conversation = conversations.get(id);
        if (!conversation) {
          conversation = { id, title: string(source.title, "Untitled conversation"), timestamp: time(source.create_time), prompts: [], identities: new Map() };
          conversations.set(id, conversation);
        }
        const path = new Set();
        let cursor = typeof source.current_node === "string" ? source.current_node : null;
        let branchKnown = cursor !== null;
        while (cursor !== null) {
          if (path.has(cursor) || !Object.hasOwn(source.mapping, cursor) || !object(source.mapping[cursor])) {
            stats.branchWarnings++; branchKnown = false; break;
          }
          path.add(cursor);
          const parent = source.mapping[cursor].parent;
          if (parent !== null && parent !== undefined && typeof parent !== "string") { branchKnown = false; stats.branchWarnings++; break; }
          cursor = parent ?? null;
        }
        for (const [nodeId, entry] of items) {
          if (nodeId.length > 300) { stats.malformed++; continue; }
          if (!object(entry)) { stats.malformed++; continue; }
          if (entry.message === null || entry.message === undefined) continue;
          const message = entry.message;
          if (!object(message) || !object(message.author) || typeof message.author.role !== "string") { stats.malformed++; continue; }
          if (message.author.role !== "user") { stats.otherMessages++; continue; }
          if (++promptCount > limits.prompts) issue("This import exceeds 10,000 user prompts. Choose fewer files.");
          const content = message.content;
          let parts = [], skipped = 0;
          if (object(content) && ["text", "multimodal_text"].includes(content.content_type) && Array.isArray(content.parts)) {
            for (const part of content.parts) {
              if (typeof part === "string") parts.push(part);
              else skipped++;
            }
          } else skipped++;
          // Attachment references are not interpreted, opened or requested.
          if (Array.isArray(message.metadata?.attachments)) skipped += message.metadata.attachments.length;
          const text = parts.join("\n");
          textLength += text.length;
          if (textLength > limits.text) issue("Extracted prompt text exceeds 4 million characters. Choose fewer files.");
          const oversized = text.length > limits.message;
          const timestamp = time(message.create_time);
          const prompt = { id: nodeId, messageId: string(message.id, nodeId, 300), conversationId: id,
            parentId: typeof entry.parent === "string" ? entry.parent : null,
            title: conversation.title, timestamp,
            branch: branchKnown ? path.has(nodeId) ? "current" : "alternate" : "unknown",
            text: text.slice(0, limits.message), originalLength: text.length,
            coverage: !text.trim() || oversized ? "unscanned" : skipped ? "partial" : "complete",
            skippedParts: skipped, truncated: oversized,
            warning: oversized ? "Prompt exceeds 20,000 characters. No score assigned; only the first 20,000 characters can be displayed." :
              !text.trim() ? "No supported text content. Attachments, images, audio and other parts were not scanned." :
                skipped ? "Only exported text was scanned. Attachments or unsupported content were excluded." : "",
          };
          const prior = conversation.identities.get(nodeId);
          if (prior) {
            // Compare the full original text, not just an oversized display prefix.
            if (prior.text === text && prior.skipped === skipped && prior.timestamp === timestamp && prior.parentId === prompt.parentId && prior.branch === prompt.branch) stats.duplicates++;
            else stats.conflicts++;
            continue;
          }
          conversation.identities.set(nodeId, { text, skipped, timestamp, parentId: prompt.parentId, branch: prompt.branch });
          conversation.prompts.push(prompt);
          if (oversized) stats.oversized++;
          if (prompt.coverage === "unscanned") stats.unsupported++;
          if (prompt.coverage === "partial") stats.partial++;
        }
      }
    }
    const result = [...conversations.values()].map(({ identities, ...conversation }) => conversation);
    stats.conversations = result.length;
    stats.prompts = result.reduce((sum, conversation) => sum + conversation.prompts.length, 0);
    if (!stats.conversations) issue("No supported ChatGPT conversations were found. No existing import was replaced.");
    if (!stats.prompts) issue("No user prompts were found in this export. Assistant, system and tool messages are not scored as your disclosures.");
    return { conversations: result, stats };
  }

  function preview(dataset) {
    return { stats: dataset.stats, conversations: dataset.conversations.map(conversation => ({
      id: conversation.id, title: conversation.title, prompts: conversation.prompts.length,
      complete: conversation.prompts.filter(prompt => prompt.coverage === "complete").length,
      partial: conversation.prompts.filter(prompt => prompt.coverage === "partial").length,
      unscanned: conversation.prompts.filter(prompt => prompt.coverage === "unscanned").length,
    })) };
  }

  async function analyze(dataset, selectedIds, { signal, onProgress = () => {}, yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)) } = {}) {
    if (!Array.isArray(selectedIds) || !selectedIds.length) issue("Select at least one conversation.");
    const selected = new Set(selectedIds);
    if (selected.size !== selectedIds.length || selectedIds.some(id => !dataset.conversations.some(c => c.id === id))) issue("The conversation selection is invalid.");
    const prompts = dataset.conversations.filter(c => selected.has(c.id)).flatMap(c => c.prompts);
    const rows = [];
    for (let index = 0; index < prompts.length; index++) {
      if (signal?.aborted) throw new Error("Import analysis cancelled.");
      const prompt = prompts[index];
      const result = prompt.coverage === "unscanned" ? null : Redact.scan(prompt.text);
      rows.push({ ...prompt, result });
      if ((index + 1) % 25 === 0 || index + 1 === prompts.length) {
        onProgress({ completed: index + 1, total: prompts.length });
        await yieldTask();
      }
    }
    if (signal?.aborted) throw new Error("Import analysis cancelled.");
    return { rows, summary: summarize(rows), importStats: dataset.stats, conversationCount: selected.size };
  }

  function summarize(rows) {
    const complete = rows.filter(row => row.result && row.coverage === "complete");
    const scored = rows.filter(row => row.result);
    const categories = Object.keys(Redact.categories).map(kind => ({ kind, label: Redact.categories[kind].label,
      count: scored.filter(row => row.result.reasons.some(reason => reason.kind === kind)).length,
    })).filter(item => item.count).sort((a, b) => b.count - a.count);
    const months = new Map();
    for (const row of rows) {
      const month = row.timestamp === null ? "Unknown date" : new Date(row.timestamp).toISOString().slice(0, 7);
      if (!months.has(month)) months.set(month, { month, prompts: 0, complete: 0, total: 0 });
      const group = months.get(month); group.prompts++;
      if (row.coverage === "complete" && row.result) { group.complete++; group.total += row.result.score; }
    }
    return { total: rows.length, complete: complete.length, partial: scored.length - complete.length, unscanned: rows.length - scored.length,
      mean: complete.length ? Math.round(complete.reduce((sum, row) => sum + row.result.score, 0) / complete.length) : null,
      high: scored.filter(row => row.result.score >= 50).length, categories,
      months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map(({ total, ...group }) => ({
        ...group, mean: group.complete ? Math.round(total / group.complete) : null,
      })), version: Redact.version };
  }

  globalThis.RedactImport = Object.freeze({ limits, parseExports, preview, analyze, summarize });
})();
