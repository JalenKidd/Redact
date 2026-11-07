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

  const rules = [
    ["secret", /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]+?-----END (?:[A-Z]+ )?PRIVATE KEY-----/g],
    ["secret", /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|AKIA[A-Z0-9]{16})\b/g],
    ["government", /\b\d{3}-\d{2}-\d{4}\b/g],
    ["student", /\b(?:student\s*(?:ID|number)|campus\s*ID)\s*(?:is\s+|[:=#]\s*)?([A-Z]{0,5}-?\d{4,12})(?![\w-])/gi, 1],
    ["card", /(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])/g],
    ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
    ["phone", /(?<![\w+])(?:\+1[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]?\d{3}[ .-]?\d{4}(?![\w-])|(?<![\w+])\+[2-9]\d(?:[ .-]?\d){7,12}(?![\w-])/g],
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

  function scan(text, contextual = []) {
    const matches = [];
    const add = (kind, start, length, source) => {
      const end = start + length;
      if (!matches.some(match => start < match.end && end > match.start)) {
        matches.push({ kind, start, end, source });
      }
    };

    for (const [kind, pattern, group = 0] of rules) {
      for (const match of text.matchAll(pattern)) {
        const value = match[group];
        if (kind === "card" && !passesLuhn(value)) continue;
        const start = match.index + (group ? match[0].lastIndexOf(value) : 0);
        add(kind, start, value.length, "rule");
      }
    }
    if (Array.isArray(contextual)) {
      const placeholders = Array.from(text.matchAll(/\[[^\[\]\r\n]{1,200}\]/g));
      for (const item of contextual.slice(0, 20)) {
        if (!item || !Object.hasOwn(categories, item.kind) || typeof item.text !== "string") continue;
        const value = item.text.trim();
        if (value.length < 3 || value.length > 200 || /[\[\]\r\n]/.test(value)) continue;
        // A model can nominate a verbatim span. Only local code can assign points or edit it.
        let start = text.indexOf(value);
        while (start !== -1) {
          const before = text[start - 1] || "";
          const end = start + value.length;
          const after = text[end] || "";
          const splitsWord = (/\w/.test(value[0]) && /\w/.test(before)) ||
            (/\w/.test(value.at(-1)) && /\w/.test(after));
          const overlapsPlaceholder = placeholders.some(match => start < match.index + match[0].length && end > match.index);
          if (!splitsWord && !overlapsPlaceholder) {
            add(item.kind, start, value.length, "context");
          }
          start = text.indexOf(value, start + value.length);
        }
      }
    }

    matches.sort((first, second) => first.start - second.start);
    const reasonKinds = [...new Set(matches.map(match => match.kind))];
    const reasons = reasonKinds.map(kind => ({
      kind,
      label: categories[kind].label,
      points: categories[kind].points,
      count: matches.filter(match => match.kind === kind).length,
      contextual: matches.some(match => match.kind === kind && match.source === "context"),
    })).sort((first, second) => second.points - first.points);
    let rewritten = text;
    for (const match of [...matches].reverse()) {
      rewritten = rewritten.slice(0, match.start) + categories[match.kind].replacement + rewritten.slice(match.end);
    }
    const score = Math.min(100, reasons.reduce((total, reason) => total + reason.points, 0));
    return { matches, reasons, score, rewritten };
  }

  const rating = score => score >= 50 ? "High exposure" : score >= 25 ? "Moderate exposure" :
    score > 0 ? "Low exposure" : "No signals found";

  globalThis.Redact = Object.freeze({ categories, sample, scan, rating });
})();
