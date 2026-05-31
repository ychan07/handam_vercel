/**
 * Animation & timing config — loaded from data/animations.json.
 * JSON 파일에는 줄(//)·블록 주석을 쓸 수 있습니다 (parseJsonWithComments).
 */

/** @param {string} text */
export function parseJsonWithComments(text) {
  let out = "";
  let i = 0;
  let inString = false;
  let escape = false;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (inString) {
      out += c;
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      i += 1;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return JSON.parse(out);
}

export const DEFAULT_ANIMATIONS = {
  loading: {
    splash: {
      minMs: 2200,
      maxMs: 4200,
      finishDelayMs: 280,
      exitMs: 520,
      revealAppDelayMs: 600,
      exitFadeDurationS: 0.5,
      markDurationS: 0.7,
      blurTextDelayMs: 90,
      blurTextStepDurationS: 0.4,
      progressBarDurationS: 0.25,
      rotatingIntervalMs: 1800,
      rotatingStaggerDurationS: 0.025,
      rotatingSpring: { damping: 22, stiffness: 280 },
      aurora: { amplitude: 1.15, blend: 0.42, speed: 0.85 },
      shinyTextSpeed: 2.8,
      appEnterDurationS: 0.65,
    },
    fortune: {
      minMs: 2800,
      maxMs: 4500,
      finishDelayMs: 300,
      exitMs: 520,
      exitFadeDurationS: 0.45,
      symbolDurationS: 0.85,
      symbolPulseDurationS: 2.4,
      blurTextDelayMs: 70,
      blurTextStepDurationS: 0.38,
      progressBarDurationS: 0.25,
      rotatingIntervalMs: 1600,
      rotatingStaggerDurationS: 0.025,
      rotatingSpring: { damping: 24, stiffness: 300 },
      aurora: { amplitude: 1.05, blend: 0.38, speed: 0.9 },
      shinyTextSpeed: 3.2,
    },
    deviceShell: { fadeDurationS: 0.5 },
  },
  reveal: {
    durationS: 0.82,
    translateYPx: 24,
    scaleFrom: 0.97,
    blurFromPx: 6,
    blurMidPx: 1,
  },
  promptRefresh: {
    exitDurationMs: 340,
    enterDurationMs: 520,
    cardStaggerMs: 55,
    partStaggerMs: 35,
    metaExitDurationMs: 220,
    metaEnterDurationMs: 420,
    cardEnterDelayMs: 90,
    cardEnterPartStaggerMs: 45,
    blurExitPx: 10,
    blurMetaExitPx: 6,
    blurEnterPx: 10,
    blurEnterMidPx: 4,
    blurMetaEnterPx: 8,
    translateExitPx: 14,
    translateMetaExitPx: 6,
    translateEnterPx: 18,
    translateMetaEnterPx: 10,
  },
  interactions: {
    spark: { durationMs: 420, sparkSize: 9, sparkRadius: 14, sparkCount: 8 },
    ripple: { removeDelayMs: 480 },
  },
  segment: { pillDurationMs: 520 },
  toast: { durationMs: 1900 },
  fortune: {
    gaugeDelayMs: 160,
    sheetOpenDelayMs: 280,
    gaugeInitDelayMs: 100,
    gaugeRingTransitionS: 1.55,
    adviceBarTransitionS: 1.1,
  },
  sheet: {
    scrimDurationS: 0.34,
    panelDurationS: 0.48,
    scrimBlurPx: 4,
    grabberPopDurationS: 0.5,
  },
  decorations: {
    heroShimmerDurationS: 5,
    pillGlowDurationS: 2.5,
    fabPulseDurationS: 3,
    promptRefreshSpinDurationS: 0.7,
    scanDurationS: 1.7,
    spinnerDurationS: 0.7,
    brandShineDurationS: 4,
    authLogoDurationS: 0.8,
    navDotDurationS: 0.45,
    chipSelectDurationS: 0.42,
  },
  easing: {
    spring: "cubic-bezier(0.22, 1, 0.36, 1)",
    outExpo: "cubic-bezier(0.16, 0.84, 0.44, 1)",
    springBounce: "cubic-bezier(0.34, 1.45, 0.64, 1)",
    sheet: "cubic-bezier(0.32, 1.1, 0.42, 1)",
  },
};

let animConfig = null;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function deepMerge(base, patch) {
  const out = { ...base };
  for (const key of Object.keys(patch || {})) {
    const next = patch[key];
    if (isPlainObject(next) && isPlainObject(base[key])) {
      out[key] = deepMerge(base[key], next);
    } else if (next !== undefined) {
      out[key] = next;
    }
  }
  return out;
}

export function getAnimations() {
  if (animConfig) return animConfig;
  if (typeof window !== "undefined" && window.__HANDAM_ANIMATIONS__) {
    animConfig = deepMerge(DEFAULT_ANIMATIONS, window.__HANDAM_ANIMATIONS__);
    return animConfig;
  }
  return DEFAULT_ANIMATIONS;
}

function px(n) {
  return `${n}px`;
}

function s(n) {
  return `${n}s`;
}

function ms(n) {
  return `${n}ms`;
}

export function applyAnimationCssVars(cfg = getAnimations()) {
  const root = document.documentElement;
  const ease = cfg.easing || {};
  const reveal = cfg.reveal || {};
  const sheet = cfg.sheet || {};
  const deco = cfg.decorations || {};
  const splash = cfg.loading?.splash || {};
  const fortuneLoading = cfg.loading?.fortune || {};
  const deviceShell = cfg.loading?.deviceShell || {};
  const fortune = cfg.fortune || {};

  root.style.setProperty("--ease-spring", ease.spring || DEFAULT_ANIMATIONS.easing.spring);
  root.style.setProperty("--ease-out-expo", ease.outExpo || DEFAULT_ANIMATIONS.easing.outExpo);
  root.style.setProperty("--ease-spring-bounce", ease.springBounce || DEFAULT_ANIMATIONS.easing.springBounce);
  root.style.setProperty("--ease-sheet", ease.sheet || DEFAULT_ANIMATIONS.easing.sheet);

  root.style.setProperty("--anim-reveal-duration", s(reveal.durationS ?? 0.82));
  root.style.setProperty("--anim-reveal-translate-y", px(reveal.translateYPx ?? 24));
  root.style.setProperty("--anim-reveal-scale-from", String(reveal.scaleFrom ?? 0.97));
  root.style.setProperty("--anim-reveal-blur-from", px(reveal.blurFromPx ?? 6));
  root.style.setProperty("--anim-reveal-blur-mid", px(reveal.blurMidPx ?? 1));

  root.style.setProperty("--anim-sheet-scrim-duration", s(sheet.scrimDurationS ?? 0.34));
  root.style.setProperty("--anim-sheet-panel-duration", s(sheet.panelDurationS ?? 0.48));
  root.style.setProperty("--anim-sheet-scrim-blur", px(sheet.scrimBlurPx ?? 4));
  root.style.setProperty("--anim-sheet-grabber-duration", s(sheet.grabberPopDurationS ?? 0.5));

  root.style.setProperty("--anim-device-fade-duration", s(deviceShell.fadeDurationS ?? 0.5));
  root.style.setProperty("--anim-splash-app-enter", s(splash.appEnterDurationS ?? 0.65));
  root.style.setProperty(
    "--anim-fortune-symbol-pulse",
    s(fortuneLoading.symbolPulseDurationS ?? 2.4)
  );

  root.style.setProperty("--anim-fortune-ring", s(fortune.gaugeRingTransitionS ?? 1.55));
  root.style.setProperty("--anim-fortune-bar", s(fortune.adviceBarTransitionS ?? 1.1));

  root.style.setProperty("--anim-deco-hero-shimmer", s(deco.heroShimmerDurationS ?? 5));
  root.style.setProperty("--anim-deco-pill-glow", s(deco.pillGlowDurationS ?? 2.5));
  root.style.setProperty("--anim-deco-fab-pulse", s(deco.fabPulseDurationS ?? 3));
  root.style.setProperty("--anim-deco-prompt-spin", s(deco.promptRefreshSpinDurationS ?? 0.7));
  root.style.setProperty("--anim-deco-scan", s(deco.scanDurationS ?? 1.7));
  root.style.setProperty("--anim-deco-spinner", s(deco.spinnerDurationS ?? 0.7));
  root.style.setProperty("--anim-deco-brand-shine", s(deco.brandShineDurationS ?? 4));
  root.style.setProperty("--anim-deco-auth-logo", s(deco.authLogoDurationS ?? 0.8));
  root.style.setProperty("--anim-deco-nav-dot", s(deco.navDotDurationS ?? 0.45));
  root.style.setProperty("--anim-deco-chip-select", s(deco.chipSelectDurationS ?? 0.42));

  root.style.setProperty("--anim-ripple-duration", ms(cfg.interactions?.ripple?.removeDelayMs ?? 480));
}

export async function loadAnimations() {
  if (animConfig) {
    applyAnimationCssVars(animConfig);
    return animConfig;
  }
  if (typeof window !== "undefined" && window.__HANDAM_ANIMATIONS__) {
    animConfig = deepMerge(DEFAULT_ANIMATIONS, window.__HANDAM_ANIMATIONS__);
    applyAnimationCssVars(animConfig);
    return animConfig;
  }
  try {
    const res = await fetch("./data/animations.json");
    if (res.ok) {
      const json = parseJsonWithComments(await res.text());
      animConfig = deepMerge(DEFAULT_ANIMATIONS, json);
      if (typeof window !== "undefined") window.__HANDAM_ANIMATIONS__ = animConfig;
    } else {
      animConfig = deepMerge({}, DEFAULT_ANIMATIONS);
    }
  } catch (_e) {
    animConfig = deepMerge({}, DEFAULT_ANIMATIONS);
  }
  applyAnimationCssVars(animConfig);
  return animConfig;
}
