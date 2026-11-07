(() => {
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => preference.matches;
  const spring = "cubic-bezier(.22, 1, .36, 1)";
  let scoreFrame;
  let tabAnimation;
  let sweep;
  let pageTransition;
  let routeVersion = 0;

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
    ], { duration: 340, easing: "ease-in-out" });
    await sweep.finished.catch(() => {});
  }

  function specimen(draft, after) {
    if (reduced()) return;
    draft.animate([
      { opacity: .5, transform: "translateY(4px)" },
      { opacity: 1, transform: "none" },
    ], { duration: 230, easing: spring });
    if (after) {
      for (const [index, mark] of [...draft.querySelectorAll("mark")].entries()) {
        mark.animate([{ backgroundColor: "#ff704f", color: "#292019" }, { backgroundColor: "#302821", color: "#fffaf0" }],
          { duration: 330, delay: index * 65, easing: spring, fill: "backwards" });
      }
    }
  }

  async function redact(marks, individual) {
    if (reduced()) return;
    const frames = individual
      ? [{ backgroundColor: "#ffdfd3", color: "#802e1e" }, { backgroundColor: "#28221d", color: "#28221d" }]
      : [{ opacity: 1, clipPath: "inset(0)" }, { opacity: .4, clipPath: "inset(0 0 95% 0)" }];
    const animations = marks.map((mark, index) => mark.animate(frames,
      { duration: individual ? 205 : 175, delay: Math.min(index, 4) * 30, easing: spring, fill: "forwards" }));
    await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
    for (const animation of animations) animation.cancel();
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

  globalThis.RedactMotion = Object.freeze({ reveal, page, navigation, switchPage, score, resetScore, scan, specimen, redact, findings });
})();
