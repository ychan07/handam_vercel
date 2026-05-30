/**
 * react-bits inspired interactions (ClickSpark + spring press + ripple).
 * Colors unchanged — motion and press feedback only.
 */

const SPARK_DEFAULTS = {
  sparkColor: "rgba(255,255,255,0.92)",
  sparkSize: 9,
  sparkRadius: 14,
  sparkCount: 8,
  duration: 420,
};

const boundSparks = new WeakSet();
const boundRipples = new WeakSet();

function easeOut(t) {
  return t * (2 - t);
}

function attachClickSpark(el, options = {}) {
  if (!el || boundSparks.has(el)) return;
  boundSparks.add(el);

  const cfg = { ...SPARK_DEFAULTS, ...options };
  const sparks = [];
  let rafId = 0;

  const pos = getComputedStyle(el).position;
  if (pos === "static") el.style.position = "relative";

  const canvas = document.createElement("canvas");
  canvas.className = "click-spark-layer";
  canvas.setAttribute("aria-hidden", "true");
  el.appendChild(canvas);

  const resize = () => {
    const { width, height } = el.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  };

  const ro = new ResizeObserver(() => resize());
  ro.observe(el);
  resize();

  const draw = (timestamp) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = canvas.width / Math.max(1, el.getBoundingClientRect().width);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      const spark = sparks[i];
      const elapsed = timestamp - spark.startTime;
      if (elapsed >= cfg.duration) {
        sparks.splice(i, 1);
        continue;
      }
      const progress = elapsed / cfg.duration;
      const eased = easeOut(progress);
      const distance = eased * cfg.sparkRadius;
      const lineLength = cfg.sparkSize * (1 - eased);
      const x1 = spark.x + distance * Math.cos(spark.angle);
      const y1 = spark.y + distance * Math.sin(spark.angle);
      const x2 = spark.x + (distance + lineLength) * Math.cos(spark.angle);
      const y2 = spark.y + (distance + lineLength) * Math.sin(spark.angle);
      ctx.strokeStyle = cfg.sparkColor;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    if (sparks.length) rafId = requestAnimationFrame(draw);
    else rafId = 0;
  };

  const burst = (clientX, clientY) => {
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const now = performance.now();
    for (let i = 0; i < cfg.sparkCount; i += 1) {
      sparks.push({
        x,
        y,
        angle: (2 * Math.PI * i) / cfg.sparkCount,
        startTime: now,
      });
    }
    if (!rafId) rafId = requestAnimationFrame(draw);
  };

  el.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0) return;
      burst(e.clientX, e.clientY);
    },
    { passive: true }
  );
}

function attachRipple(el) {
  if (!el || boundRipples.has(el)) return;
  boundRipples.add(el);

  const pos = getComputedStyle(el).position;
  if (pos === "static") el.style.position = "relative";
  if (getComputedStyle(el).overflow === "visible") el.style.overflow = "hidden";

  el.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0) return;
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty("--ripple-x", `${x}%`);
      el.style.setProperty("--ripple-y", `${y}%`);
      el.classList.remove("is-rippling");
      void el.offsetWidth;
      el.classList.add("is-rippling");
    },
    { passive: true }
  );

  el.addEventListener(
    "pointerup",
    () => {
      window.setTimeout(() => el.classList.remove("is-rippling"), 480);
    },
    { passive: true }
  );
  el.addEventListener(
    "pointercancel",
    () => el.classList.remove("is-rippling"),
    { passive: true }
  );
}

const SPARK_SELECTORS = [".btn-primary", ".fab", ".fortune-hero.tap"];
const RIPPLE_SELECTORS = [
  ".press-spring",
  ".press-card",
  ".press-chip",
  ".press-nav",
  ".iconbtn",
  ".emo-opt",
  ".seg button",
  ".list-item.tap",
  ".admin-tool-btn",
];

const PRESS_CLASS_MAP = [
  [".btn", "press-spring"],
  [".iconbtn", "press-spring"],
  [".fab", "press-spring"],
  [".nav-item", "press-nav"],
  [".card.tap", "press-card"],
  [".prompt-card.tap", "press-card"],
  [".diary-row.tap", "press-card"],
  [".emo-opt", "press-chip"],
  [".admin-tool-btn", "press-spring"],
  [".list-item.tap", "press-card"],
];

function applyPressClasses(scope) {
  for (const [selector, className] of PRESS_CLASS_MAP) {
    scope.querySelectorAll(selector).forEach((el) => el.classList.add(className));
  }
}

export function initInteractions(root = document) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const scope = root instanceof Element ? root : document;
  applyPressClasses(scope);

  for (const sel of SPARK_SELECTORS) {
    scope.querySelectorAll(sel).forEach((el) => {
      attachClickSpark(el, sel.includes("fortune") ? { sparkColor: "rgba(255,255,255,0.85)" } : {});
    });
  }

  for (const sel of RIPPLE_SELECTORS) {
    scope.querySelectorAll(sel).forEach(attachRipple);
  }
}

export function refreshInteractions() {
  initInteractions(document);
}
