/**
 * Elastic segmented control — react-bits ElasticSlider spring-style pill glide.
 */

const SEG_SPRING = "cubic-bezier(0.34, 1.45, 0.64, 1)";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function ensureSegPill(seg) {
  let pill = seg.querySelector(".seg-pill");
  if (!pill) {
    pill = document.createElement("span");
    pill.className = "seg-pill";
    pill.setAttribute("aria-hidden", "true");
    seg.prepend(pill);
  }
  return pill;
}

function moveSegPill(seg, { animate = true } = {}) {
  const pill = ensureSegPill(seg);
  const active = seg.querySelector("button.on");
  if (!active) {
    pill.style.opacity = "0";
    return;
  }
  pill.style.opacity = "1";
  const pad = 3;
  const x = active.offsetLeft;
  const w = active.offsetWidth;

  if (!animate || prefersReducedMotion()) {
    pill.style.width = `${w}px`;
    pill.style.transform = `translateX(${x}px) scaleX(1)`;
    return;
  }

  const fromX = pill._x ?? x;
  const fromW = pill._w ?? w;
  pill._x = x;
  pill._w = w;

  const stretch = Math.abs(x - fromX) > 2 ? 1.06 : 1.02;
  pill.animate(
    [
      {
        transform: `translateX(${fromX}px) scaleX(${fromW / w})`,
        width: `${fromW}px`,
        offset: 0,
      },
      {
        transform: `translateX(${x + (x > fromX ? -4 : 4)}px) scaleX(${stretch})`,
        width: `${w * stretch}px`,
        offset: 0.45,
      },
      {
        transform: `translateX(${x}px) scaleX(1)`,
        width: `${w}px`,
        offset: 1,
      },
    ],
    { duration: 520, easing: SEG_SPRING, fill: "forwards" }
  );

  pill.style.width = `${w}px`;
  pill.style.transform = `translateX(${x}px)`;
}

function bindElasticSegment(seg) {
  if (seg.dataset.elasticBound === "1") return;
  seg.dataset.elasticBound = "1";
  seg.classList.add("seg-elastic");
  ensureSegPill(seg);
  moveSegPill(seg, { animate: false });

  seg.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || !seg.contains(btn)) return;
    seg.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
    btn.classList.add("on");
    moveSegPill(seg, { animate: true });
  });

  window.addEventListener("resize", () => moveSegPill(seg, { animate: false }));
}

export function initElasticSegments(root = document) {
  const scope = root instanceof Element ? root : document;
  scope.querySelectorAll(".seg-elastic").forEach(bindElasticSegment);
}

export function refreshElasticSegments() {
  document.querySelectorAll(".seg-elastic").forEach((seg) => moveSegPill(seg, { animate: false }));
}
