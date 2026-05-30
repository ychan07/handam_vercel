/**
 * Prompt refresh motion — react-bits FadeContent + BlurText patterns (vanilla WAAPI).
 */

const PROMPT_PARTS = ".match, .prompt-emoji, h3, p";
const EASE_OUT = "cubic-bezier(0.4, 0, 0.2, 1)";
const EASE_SPRING = "cubic-bezier(0.22, 1, 0.36, 1)";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function runAnim(el, keyframes, options) {
  if (!el || prefersReducedMotion()) return Promise.resolve();
  const anim = el.animate(keyframes, options);
  return anim.finished.catch(() => {});
}

function animatePromptParts(parts, keyframes, baseDelay, stagger) {
  const isExit = keyframes.length === 2 && keyframes[1].opacity === 0;
  return Promise.all(
    [...parts].map((el, i) =>
      runAnim(el, keyframes, {
        duration: isExit ? 340 : 520,
        delay: baseDelay + i * stagger,
        easing: isExit ? EASE_OUT : EASE_SPRING,
        fill: "forwards",
      })
    )
  );
}

/**
 * Fade out (blur + slide up) → update content → fade in (blur resolve + stagger).
 */
export async function animatePromptRefresh(updateContent) {
  const cards = [...document.querySelectorAll(".prompt-slot")];
  const meta = document.getElementById("prompt-meta");
  const refreshBtn = document.getElementById("prompt-refresh-btn");

  if (prefersReducedMotion()) {
    updateContent();
    return;
  }

  if (refreshBtn) {
    refreshBtn.classList.add("is-refreshing");
    refreshBtn.disabled = true;
  }

  cards.forEach((card) => card.classList.add("prompt-animating"));

  await Promise.all(
    cards.map((card, cardIndex) => {
      const parts = card.querySelectorAll(PROMPT_PARTS);
      return animatePromptParts(
        parts,
        [
          { opacity: 1, filter: "blur(0px)", transform: "translateY(0) scale(1)" },
          { opacity: 0, filter: "blur(10px)", transform: "translateY(-14px) scale(0.97)" },
        ],
        cardIndex * 55,
        35
      );
    })
  );

  if (meta) {
    await runAnim(
      meta,
      [
        { opacity: 1, filter: "blur(0px)", transform: "translateY(0)" },
        { opacity: 0, filter: "blur(6px)", transform: "translateY(-6px)" },
      ],
      { duration: 220, easing: EASE_OUT, fill: "forwards" }
    );
  }

  updateContent();

  cards.forEach((card) => {
    const parts = card.querySelectorAll(PROMPT_PARTS);
    parts.forEach((el) => {
      el.style.opacity = "0";
      el.style.filter = "blur(10px)";
      el.style.transform = "translateY(18px)";
    });
  });

  if (meta) {
    meta.style.opacity = "0";
    meta.style.filter = "blur(8px)";
    meta.style.transform = "translateY(10px)";
  }

  await Promise.all(
    cards.map((card, cardIndex) => {
      const parts = card.querySelectorAll(PROMPT_PARTS);
      return animatePromptParts(
        parts,
        [
          { opacity: 0, filter: "blur(10px)", transform: "translateY(18px) scale(0.98)" },
          { opacity: 0.55, filter: "blur(4px)", transform: "translateY(6px) scale(0.99)" },
          { opacity: 1, filter: "blur(0px)", transform: "translateY(0) scale(1)" },
        ],
        cardIndex * 90,
        45
      ).then(() => {
        parts.forEach((el) => {
          el.style.opacity = "";
          el.style.filter = "";
          el.style.transform = "";
        });
      });
    })
  );

  if (meta) {
    await runAnim(
      meta,
      [
        { opacity: 0, filter: "blur(8px)", transform: "translateY(10px)" },
        { opacity: 1, filter: "blur(0px)", transform: "translateY(0)" },
      ],
      { duration: 420, easing: EASE_SPRING, fill: "forwards" }
    );
    meta.style.opacity = "";
    meta.style.filter = "";
    meta.style.transform = "";
  }

  cards.forEach((card) => card.classList.remove("prompt-animating"));

  if (refreshBtn) {
    refreshBtn.classList.remove("is-refreshing");
    refreshBtn.disabled = false;
  }
}
