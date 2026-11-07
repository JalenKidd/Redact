(() => {
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => preference.matches;
  const spring = "cubic-bezier(.22, 1, .36, 1)";
  let scoreFrame;
  let tabAnimation;
  let sweep;
  let pageTransition;
  let routeVersion = 0;
  let profileAnimations = [];

  function navigation(tab, animate = true) {
    if (!tab) return;
    const indicator = tab.parentElement.querySelector(".nav-indicator");
    const parent = tab.parentElement.getBoundingClientRect();
    const old = indicator.getBoundingClientRect();
    const next = tab.getBoundingClientRect();
    const position = rect => "translate(" + (rect.left - parent.left - tab.parentElement.clientLeft) + "px," +
      (rect.top - parent.top - tab.parentElement.clientTop) + "px)";
    tabAnimation?.cancel();
    Object.assign(indicator.style, { transform: position(next), width: next.width + "px", height: next.height + "px" });
    if (!reduced() && animate && old.width) {
      tabAnimation = indicator.animate([
        { transform: position(old), width: old.width + "px", height: old.height + "px" },
        { transform: position(next), width: next.width + "px", height: next.height + "px" },
      ], { duration: 290, easing: spring });
    }
  }

  function switchPage(from, to, routes, render) {
    const version = ++routeVersion;
    pageTransition?.skipTransition();
    const show = animate => {
      if (version !== routeVersion) return;
      render(to, animate);
      window.scrollTo(0, 0);
      if (!animate) arrive(document.getElementById(to + "-page"));
    };
    const root = document.documentElement;
    if (from === to || reduced() || !document.startViewTransition) {
      delete root.dataset.slide;
      return show(true);
    }
    const order = Object.keys(routes);
    root.dataset.slide = order.indexOf(to) > order.indexOf(from) ? "next" : "previous";
    pageTransition = document.startViewTransition(() => show(false));
    void pageTransition.finished.catch(() => {}).finally(() => {
      if (version === routeVersion) delete root.dataset.slide;
    });
  }

  function reveal(element) {
    if (reduced() || element.hidden) return;
    element.animate([
      { opacity: 0, transform: "translateY(7px)" },
      { opacity: 1, transform: "translateY(0)" },
    ], { duration: 270, easing: spring });
  }

  function page(element, direction = 1) {
    if (reduced()) return;
    element.animate([
      { opacity: 0, transform: "translate(" + direction * 12 + "px, 5px)" },
      { opacity: 1, transform: "none" },
    ], { duration: 290, easing: spring });
  }

  function stagger(elements) {
    if (reduced()) return;
    [...elements].filter(element => element.getClientRects().length).slice(0, 7).forEach((element, index) => {
      element.animate([
        { opacity: .45, transform: "translateY(11px)" },
        { opacity: 1, transform: "none" },
      ], { duration: 355, delay: index * 38, fill: "backwards", easing: spring });
    });
  }

  function arrive(element) {
    stagger(element.querySelectorAll("[data-arrive]"));
  }

  function score(target) {
    cancelAnimationFrame(scoreFrame);
    const value = document.getElementById("score-value");
    const track = document.getElementById("score-track-value");
    const current = Number.parseInt(value.textContent, 10) || 0;
    const update = number => {
      value.textContent = Math.round(number);
      track.style.strokeDashoffset = String(100 - number);
    };
    if (reduced() || current === target) {
      update(target);
      return;
    }
    const start = performance.now();
    const tick = now => {
      const progress = Math.min(1, (now - start) / 800);
      update(current + (target - current) * (1 - (1 - progress) ** 3));
      if (progress < 1) scoreFrame = requestAnimationFrame(tick);
    };
    scoreFrame = requestAnimationFrame(tick);
  }

  function resetScore() {
    cancelAnimationFrame(scoreFrame);
    document.getElementById("score-value").textContent = "—";
    document.getElementById("score-track-value").style.strokeDashoffset = "100";
  }

  async function scan() {
    if (reduced()) return;
    sweep?.cancel();
    const line = document.querySelector(".scan-light");
    sweep = line.animate([
      { opacity: 0, transform: "translateY(-26px)" },
      { opacity: 1, offset: .2 },
      { opacity: .8, offset: .78 },
      { opacity: 0, transform: "translateY(" + line.parentElement.clientHeight + "px)" },
    ], { duration: 460, easing: "ease-in-out" });
    await sweep.finished.catch(() => {});
  }

  function profile(dialog, origin, avatar, sections) {
    profileAnimations.forEach(animation => animation.cancel());
    if (reduced()) return;
    const panel = dialog.getBoundingClientRect();
    const target = avatar.getBoundingClientRect();
    const mobile = matchMedia("(max-width: 650px)").matches;
    const bounded = (n, limit) => Math.max(-limit, Math.min(n, limit));
    const dx = bounded(origin.x + origin.width / 2 - target.x - target.width / 2, 86);
    const dy = bounded(origin.y + origin.height / 2 - target.y - target.height / 2, 44);
    const pivot = bounded((origin.x - panel.x) / Math.max(1, panel.width) * 100 - 50, 50) + 50;
    profileAnimations = [
      dialog.animate([
        { opacity: .15, transform: mobile ? "translateY(50px)" : "translateY(15px) scale(.96)", transformOrigin: pivot + "% 55%" },
        { opacity: 1, transform: "none", transformOrigin: pivot + "% 55%" },
      ], { duration: mobile ? 320 : 290, easing: spring }),
      avatar.animate([
        { opacity: .6, transform: "translate(" + dx + "px," + dy + "px) scale(.58)" },
        { opacity: 1, transform: "none" },
      ], { duration: 400, easing: "cubic-bezier(.18,.9,.28,1.15)" }),
      ...sections.map((section, index) => section.animate([
        { opacity: 0, transform: "translateY(9px)" },
        { opacity: 1, transform: "none" },
      ], { duration: 250, delay: 35 + index * 38, easing: spring, fill: "backwards" })),
    ];
  }

  function revealTokens(tokens, delay = 0) {
    if (reduced()) return [];
    return tokens.slice(0, 14).map((token, index) => token.animate([
      { backgroundColor: "var(--mask-color)", color: "transparent" },
      { backgroundColor: "var(--mask-color)", color: "transparent", offset: .2 },
      { backgroundColor: "var(--token-bg)", color: "var(--token-ink)" },
    ], { duration: 210, delay: delay + Math.min(index, 5) * 38, easing: spring, fill: "backwards" }));
  }

  async function redact(originals, replacements = []) {
    if (reduced()) return;
    const wipes = originals.slice(0, 18).map((mark, index) => mark.animate([
      { backgroundSize: "0% 100%", color: "var(--warn)" },
      { backgroundSize: "78% 100%", color: "var(--warn)", offset: .55 },
      { backgroundSize: "100% 100%", color: "transparent" },
    ], { duration: 210, delay: Math.min(index, 5) * 36, easing: spring, fill: "forwards" }));
    const reveals = revealTokens(replacements, 95);
    await Promise.all([...wipes, ...reveals].map(animation => animation.finished.catch(() => {})));
    wipes.forEach(animation => animation.cancel());
  }

  function applied(field) {
    if (reduced()) return;
    field.animate([
      { boxShadow: "0 0 0 2px var(--good)" },
      { boxShadow: "0 0 0 7px transparent" },
    ], { duration: 390, easing: spring });
  }

  function findings() {
    if (reduced()) return;
    document.querySelectorAll(".finding").forEach((row, index) => {
      row.animate([
        { opacity: 0, transform: "translateY(7px)" },
        { opacity: 1, transform: "translateY(0)" },
      ], { duration: 300, delay: 90 + index * 70, fill: "backwards", easing: spring });
    });
  }

  globalThis.RedactMotion = Object.freeze({ reduced, reveal, page, arrive, stagger, navigation, switchPage, score, resetScore, scan, profile, revealTokens, redact, applied, findings });
})();
