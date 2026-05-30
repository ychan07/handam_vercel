/**
 * Prompt refresh motion — react-bits FadeContent + BlurText patterns (vanilla WAAPI).
 */

import { getAnimations } from "./animations.js";

const PROMPT_PARTS = ".match, .prompt-emoji, h3, p";
const EASE_OUT = "cubic-bezier(0.4, 0, 0.2, 1)";
const EASE_SPRING = "cubic-bezier(0.22, 1, 0.36, 1)";

function promptAnim() {
  return getAnimations().promptRefresh || {};
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function runAnim(el, keyframes, options) {
  if (!el || prefersReducedMotion()) return Promise.resolve();
  const anim = el.animate(keyframes, options);
  return anim.finished.catch(() => {});
}

function animatePromptParts(parts, keyframes, baseDelay, stagger) {
  const cfg = promptAnim();
  const isExit = keyframes.length === 2 && keyframes[1].opacity === 0;
  return Promise.all(
    [...parts].map((el, i) =>
      runAnim(el, keyframes, {
        duration: isExit ? (cfg.exitDurationMs ?? 340) : (cfg.enterDurationMs ?? 520),
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
  const cfg = promptAnim();
  const cards = [...document.querySelectorAll(".prompt-slot")];
  const meta = document.getElementById("prompt-meta");
  const refreshBtn = document.getElementById("prompt-refresh-btn");
  const blurExit = cfg.blurExitPx ?? 10;
  const blurMetaExit = cfg.blurMetaExitPx ?? 6;
  const blurEnter = cfg.blurEnterPx ?? 10;
  const blurEnterMid = cfg.blurEnterMidPx ?? 4;
  const blurMetaEnter = cfg.blurMetaEnterPx ?? 8;
  const tyExit = cfg.translateExitPx ?? 14;
  const tyMetaExit = cfg.translateMetaExitPx ?? 6;
  const tyEnter = cfg.translateEnterPx ?? 18;
  const tyMetaEnter = cfg.translateMetaEnterPx ?? 10;

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
          { opacity: 0, filter: `blur(${blurExit}px)`, transform: `translateY(-${tyExit}px) scale(0.97)` },
        ],
        cardIndex * (cfg.cardStaggerMs ?? 55),
        cfg.partStaggerMs ?? 35
      );
    })
  );

  if (meta) {
    await runAnim(
      meta,
      [
        { opacity: 1, filter: "blur(0px)", transform: "translateY(0)" },
        { opacity: 0, filter: `blur(${blurMetaExit}px)`, transform: `translateY(-${tyMetaExit}px)` },
      ],
      { duration: cfg.metaExitDurationMs ?? 220, easing: EASE_OUT, fill: "forwards" }
    );
  }

  updateContent();

  cards.forEach((card) => {
    const parts = card.querySelectorAll(PROMPT_PARTS);
    parts.forEach((el) => {
      el.style.opacity = "0";
      el.style.filter = `blur(${blurEnter}px)`;
      el.style.transform = `translateY(${tyEnter}px)`;
    });
  });

  if (meta) {
    meta.style.opacity = "0";
    meta.style.filter = `blur(${blurMetaEnter}px)`;
    meta.style.transform = `translateY(${tyMetaEnter}px)`;
  }

  await Promise.all(
    cards.map((card, cardIndex) => {
      const parts = card.querySelectorAll(PROMPT_PARTS);
      return animatePromptParts(
        parts,
        [
          { opacity: 0, filter: `blur(${blurEnter}px)`, transform: `translateY(${tyEnter}px) scale(0.98)` },
          { opacity: 0.55, filter: `blur(${blurEnterMid}px)`, transform: `translateY(6px) scale(0.99)` },
          { opacity: 1, filter: "blur(0px)", transform: "translateY(0) scale(1)" },
        ],
        cardIndex * (cfg.cardEnterDelayMs ?? 90),
        cfg.cardEnterPartStaggerMs ?? 45
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
        { opacity: 0, filter: `blur(${blurMetaEnter}px)`, transform: `translateY(${tyMetaEnter}px)` },
        { opacity: 1, filter: "blur(0px)", transform: "translateY(0)" },
      ],
      { duration: cfg.metaEnterDurationMs ?? 420, easing: EASE_SPRING, fill: "forwards" }
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
