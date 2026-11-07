(() => {
  const categories = Object.freeze({
    secret: { label: "Credential or API key", points: 60, replacement: "[credential]" },
    government: { label: "Government ID", points: 50, replacement: "[government ID]" },
    card: { label: "Payment card", points: 50, replacement: "[payment card]" },
    address: { label: "Street address", points: 30, replacement: "[address]" },
    student: { label: "Student ID", points: 25, replacement: "[student ID]" },
    phone: { label: "Phone number", points: 25, replacement: "[phone number]" },
    medical: { label: "Personal health detail", points: 25, replacement: "[health detail]" },
    email: { label: "Email address", points: 20, replacement: "[email]" },
    name: { label: "Full name", points: 15, replacement: "[name]" },
  });

  const VERSION = "2.0.0";
  const MAX_LENGTH = 20000;
  const nameWord = "(?:[\\p{Lu}]\\.|[\\p{Lu}][\\p{L}\\p{M}'’-]*)";
  const fullName = `${nameWord}(?:[ \\t]+(?:de|del|van|von|da|dos|al|${nameWord})){1,4}`;
  const disease = "(?:type[ -]?[12] diabetes|diabetes|asthma|HIV|AIDS|cancer|depression|anxiety|ADHD|PTSD|bipolar disorder|epilepsy|multiple sclerosis|Crohn['’]s disease|high blood pressure)";
  const street = "(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd|Court|Ct|Way|Place|Pl|Terrace|Ter|Circle|Cir)";
  const placeholderPattern = /\[(?:credential|government ID|payment card|address|student ID|phone number|health detail|email|name)(?: \d+)?\]/g;
  // Literal weak passwords are still credentials; exempt only typed template tokens.
  const credentialExample = /^(?:<(?:YOUR_)?(?:API_KEY|PASSWORD|TOKEN|SECRET)>|\[(?:credential|api key|password|token|secret)\])$/i;
  const boundary = character => /[\p{L}\p{M}\p{N}_]/u.test(character || "");
  const rules = [
    ["secret", /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]+?-----END (?:[A-Z]+ )?PRIVATE KEY-----/g],
    ["secret", /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{15,})\b/g],
    ["secret", /\b(?:password|passwd|api[ _-]?key|access[ _-]?token|client[ _-]?secret)["']?\s*(?:is\s+|[:=]\s*)(?:["']([^"'\r\n]{4,200})["']|([^\s,;"']{4,200}))/gi, "credential"],
    ["secret", /\bBearer[ \t]+([A-Za-z0-9._~+/-]{12,}={0,2})/gi, 1],
    ["government", /\b\d{3}-\d{2}-\d{4}\b/g],
    ["student", /\b(?:student\s*(?:ID|number)|campus\s*ID)\s*(?:is\s+|[:=#]\s*)?([A-Z]{0,5}-?\d{4,12})(?![\w-])/gi, 1],
    ["card", /(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])/g],
    ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
    ["phone", /(?<![\w+])(?:\+1[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]?\d{3}[ .-]?\d{4}(?![\w-])|(?<![\w+])\+[2-9]\d(?:[ .-]?\d){7,12}(?![\w-])/g],
    ["address", new RegExp(`\\b\\d{1,6}[ \\t]+(?:[\\p{L}][\\p{L}\\p{M}'’.-]*[ \\t]+){1,5}${street}\\b\\.?(?:[ \\t]+(?:Apt\\.?|Apartment|Suite|Unit|#)[ \\t]*[\\w-]+)?`, "giu")],
    ["name", new RegExp(`\\b(?:[Mm]y (?:full )?name is|[Ii] am|[Ii]['’]m|[Nn]ame[ \\t]*:)[ \\t]+(${fullName})`, "gu"), 1],
    ["medical", new RegExp(`\\b(?:I (?:have|was diagnosed with|am being treated for)|I['’]ve been diagnosed with|my (?:diagnosis is|child has|mother has|father has|partner has))[ \\t]+(${disease})\\b`, "gi"), 1],
  ];

  const sample = "Draft a short email asking my professor for a one-day extension on my lab report. For reference, my phone number is (202) 555-0147 and my student ID is PH-482716.";

  function passesLuhn(value) {
    const digits = value.replace(/\D/g, "");
    if (/^(\d)\1+$/.test(digits)) return false;
    let total = 0;
    for (let index = digits.length - 1; index >= 0; index--) {
      let digit = Number(digits[index]);
      if ((digits.length - index) % 2 === 0) digit *= 2;
      total += digit > 9 ? digit - 9 : digit;
    }
    return total % 10 === 0;
  }

  function validateText(text) {
    if (typeof text !== "string" || text.length > MAX_LENGTH) throw new Error("Use a draft of at most 20,000 characters.");
  }

  function summarize(matches) {
    const reasons = [...new Set(matches.map(match => match.kind))].map(kind => ({
      kind, label: categories[kind].label, points: categories[kind].points,
      count: matches.filter(match => match.kind === kind).length,
      contextual: matches.some(match => match.kind === kind && match.source === "context"),
    })).sort((first, second) => second.points - first.points);
    return { reasons, score: Math.min(100, reasons.reduce((sum, reason) => sum + reason.points, 0)) };
  }

  function scan(text, contextual = [], buildRewrite = true) {
    validateText(text);
    const matches = [];
    const placeholders = [...text.matchAll(placeholderPattern)];
    const add = (kind, start, length, source) => {
      const end = start + length;
      if (placeholders.some(match => start < match.index + match[0].length && end > match.index)) return;
      if (!matches.some(match => start < match.end && end > match.start)) {
        matches.push({ id: `${kind}:${start}:${end}`, kind, start, end, source });
      }
    };

    for (const [kind, pattern, group = 0] of rules) {
      for (const match of text.matchAll(pattern)) {
        let value = group === "credential" ? match[1] ?? match[2] : match[group];
        if (kind === "name" || kind === "address") value = value.replace(/[.,;:!?]+$/u, "");
        if (kind === "card" && !passesLuhn(value)) continue;
        if (group === "credential" && credentialExample.test(value)) continue;
        const start = match.index + (group ? match[0].lastIndexOf(value) : 0);
        add(kind, start, value.length, "rule");
      }
    }
    if (Array.isArray(contextual)) {
      for (const item of contextual.slice(0, 100)) {
        if (!item || !Object.hasOwn(categories, item.kind) || typeof item.text !== "string") continue;
        const value = item.text.trim();
        if (value.length < 2 || value.length > 300 || /[\r\n]/.test(value)) continue;
        // A model can nominate a verbatim span. Only local code can assign points or edit it.
        let start = text.indexOf(value);
        while (start !== -1) {
          const before = text[start - 1] || "";
          const end = start + value.length;
          const after = text[end] || "";
          const splitsWord = (boundary(value[0]) && boundary(before)) ||
            (boundary(value.at(-1)) && boundary(after));
          const overlapsPlaceholder = placeholders.some(match => start < match.index + match[0].length && end > match.index);
          if (!splitsWord && !overlapsPlaceholder) {
            add(item.kind, start, value.length, "context");
          }
          start = text.indexOf(value, start + value.length);
        }
      }
    }

    matches.sort((first, second) => first.start - second.start);
    const result = { matches, ...summarize(matches), version: VERSION,
      coverage: { rules: true, contextual: false, language: "Primarily English; structured identifiers vary by format." } };
    return { ...result, rewritten: buildRewrite ? rewrite(text, result).text : text };
  }

  function rewrite(text, result, choices = {}) {
    validateText(text);
    const tokens = new Map(), counters = new Map(), edits = [], projected = [];
    let output = "", offset = 0;
    for (const match of result.matches) {
      const action = Object.hasOwn(choices, match.id) ? choices[match.id] : "replace";
      if (!["keep", "replace"].includes(action)) throw new Error("Choose keep or replace for each detail.");
      const value = text.slice(match.start, match.end);
      output += text.slice(offset, match.start);
      const start = output.length;
      if (action === "keep") {
        output += value;
        projected.push({ ...match, start, end: output.length, id: `${match.kind}:${start}:${output.length}` });
      } else {
        const identity = `${match.kind}\0${value.normalize("NFC")}`;
        if (!tokens.has(identity)) {
          let next = counters.get(match.kind) || 1;
          let token;
          do {
            token = categories[match.kind].replacement.replace("]", next === 1 ? "]" : ` ${next}]`);
            next++;
          } while (text.includes(token));
          counters.set(match.kind, next);
          tokens.set(identity, token);
        }
        output += tokens.get(identity);
      }
      edits.push({ id: match.id, kind: match.kind, action, before: value, after: output.slice(start),
        explanation: action === "keep" ? "Kept because you chose to retain this context; it still contributes to exposure." :
          "Replaced with a consistent placeholder. All text outside this detail is preserved." });
      offset = match.end;
    }
    output += text.slice(offset);
    const remaining = scan(output, [], false).matches;
    // Carry known contextual findings through offset changes. A rules-only rescan
    // must not make retained model findings disappear from the comparison.
    for (const match of projected) {
      if (!remaining.some(item => item.start < match.end && item.end > match.start)) remaining.push(match);
    }
    remaining.sort((a, b) => a.start - b.start);
    return { text: output, matches: remaining, edits, ...summarize(remaining), version: VERSION,
      comparison: "Same rules and retained contextual findings; no new semantic scan of the rewrite." };
  }

  const rating = score => score >= 50 ? "High exposure" : score >= 25 ? "Moderate exposure" :
    score > 0 ? "Low exposure" : "No signals found";

  globalThis.Redact = Object.freeze({ categories, sample, scan, rewrite, rating, version: VERSION, maxLength: MAX_LENGTH });
})();
