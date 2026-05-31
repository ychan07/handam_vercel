import type { CSSProperties } from "react";

/** 북두칠성 — SVG 경로 + CSS 별·글로우 (이모지 없음) */

const ZODIAC_ORDER = [
  "양자리",
  "황소자리",
  "쌍둥이자리",
  "게자리",
  "사자자리",
  "처녀자리",
  "천칭자리",
  "전갈자리",
  "사수자리",
  "염소자리",
  "물병자리",
  "물고기자리",
] as const;

/** viewBox 0 0 200 200 — 북두칠성 7성 좌표 (% 단위로 별 배치) */
const STARS = [
  { x: 72, y: 22, size: 5, delay: 0.05 }, // Dubhe
  { x: 88, y: 40, size: 4, delay: 0.12 }, // Merak
  { x: 64, y: 44, size: 4, delay: 0.19 }, // Phecda
  { x: 44, y: 40, size: 4, delay: 0.26 }, // Megrez
  { x: 34, y: 54, size: 3.5, delay: 0.33 }, // Alioth
  { x: 24, y: 70, size: 3.5, delay: 0.4 }, // Mizar
  { x: 14, y: 88, size: 4.5, delay: 0.47 }, // Alkaid (꼬리)
] as const;

/** 그릇 4각 + 손잡이 3연결 */
const LINE_PATH =
  "M 144 44 L 176 80 L 128 88 L 88 80 Z M 88 80 L 68 108 L 48 140 L 28 176";

type BigDipperConstellationProps = {
  westernZodiac: string;
  lineDrawDurationS?: number;
  twinkleDurationS?: number;
  starStaggerMs?: number;
};

export function zodiacAccentStarIndex(westernZodiac: string): number {
  const idx = ZODIAC_ORDER.indexOf(westernZodiac as (typeof ZODIAC_ORDER)[number]);
  return (idx >= 0 ? idx : 0) % 7;
}

export default function BigDipperConstellation({
  westernZodiac,
  lineDrawDurationS = 1.65,
  twinkleDurationS = 2.4,
  starStaggerMs = 70,
}: BigDipperConstellationProps) {
  const accent = zodiacAccentStarIndex(westernZodiac);

  return (
    <div
      className="big-dipper"
      style={
        {
          "--dipper-line-draw": `${lineDrawDurationS}s`,
          "--dipper-twinkle": `${twinkleDurationS}s`,
          "--dipper-stagger": `${starStaggerMs}ms`,
        } as CSSProperties
      }
      aria-hidden
    >
      <div className="big-dipper__nebula" />
      <div className="big-dipper__ring" />
      <div className="big-dipper__dust">
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} className="big-dipper__speck" style={{ "--i": i } as CSSProperties} />
        ))}
      </div>

      <svg className="big-dipper__svg" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="dipper-line-grad" x1="28" y1="44" x2="176" y2="176" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(255, 248, 240, 0.15)" />
            <stop offset="35%" stopColor="rgba(240, 200, 150, 0.55)" />
            <stop offset="70%" stopColor="rgba(255, 248, 240, 0.75)" />
            <stop offset="100%" stopColor="rgba(232, 168, 92, 0.35)" />
          </linearGradient>
          <filter id="dipper-line-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          className="big-dipper__path"
          d={LINE_PATH}
          stroke="url(#dipper-line-grad)"
          strokeWidth="1.15"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#dipper-line-glow)"
        />
      </svg>

      <div className="big-dipper__stars">
        {STARS.map((star, i) => (
          <span
            key={i}
            className={`big-dipper__star${i === accent ? " is-accent" : ""}`}
            style={
              {
                left: `${star.x}%`,
                top: `${star.y}%`,
                "--star-size": `${star.size}px`,
                "--star-delay": `${star.delay}s`,
                "--star-i": i,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
