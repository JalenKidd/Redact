(() => {
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => preference.matches;
  const spring = "cubic-bezier(.22, 1, .36, 1)";
  let scoreFrame;

  function reveal(element) {
    if (reduced() || element.hidden) return;
    element.animate([
      { opacity: 0, transform: "translateY(12px)" },
      { opacity: 1, transform: "translateY(0)" },
    ], { duration: 380, easing: spring });
  }

  function page(element, direction = 1) {
    if (reduced()) return;
    element.animate([
      { opacity: 0, transform: "translateX(" + direction * 18 + "px) scale(.992)" },
      { opacity: 1, transform: "translateX(0) scale(1)" },
    ], { duration: 380, easing: spring });
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

  function scan() {
    if (reduced()) return;
    document.querySelector(".scan-light").animate([
      { opacity: 0, transform: "translateY(-12px)" },
      { opacity: .85, offset: .18 },
      { opacity: .55, offset: .8 },
      { opacity: 0, transform: "translateY(260px)" },
    ], { duration: 650, easing: "ease-in-out" });
  }

  async function redact(container) {
    if (reduced()) return;
    const animations = [...container.querySelectorAll("mark")].map((mark, index) => mark.animate([
      { backgroundColor: "#e9defb", color: "#7853a6", transform: "scaleX(1)" },
      { backgroundColor: "#30243f", color: "#30243f", transform: "scaleX(1.02)" },
    ], { duration: 240, delay: index * 45, easing: spring, fill: "forwards" }));
    await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
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

  globalThis.RedactMotion = Object.freeze({ reveal, page, score, resetScore, scan, redact, findings });
})();
