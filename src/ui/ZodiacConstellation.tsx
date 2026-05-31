import { useId } from "react";
import type { CSSProperties } from "react";
import {
  getZodiacConstellation,
  starAppearDelay,
} from "./zodiac-constellations";

type ZodiacConstellationProps = {
  westernZodiac: string;
  lineDrawDurationS?: number;
  twinkleDurationS?: number;
  starStaggerMs?: number;
};

export default function ZodiacConstellation({
  westernZodiac,
  lineDrawDurationS = 1.65,
  twinkleDurationS = 2.4,
  starStaggerMs = 70,
}: ZodiacConstellationProps) {
  const uid = useId().replace(/:/g, "");
  const gradId = `zodiac-line-grad-${uid}`;
  const glowId = `zodiac-line-glow-${uid}`;
  const zodiacKey = westernZodiac.trim();
  const { stars, pathD, pathLength, accentIndex } = getZodiacConstellation(zodiacKey);

  return (
    <div
      key={zodiacKey}
      className="zodiac-const"
      data-zodiac={zodiacKey}
      style={
        {
          "--zodiac-line-draw": `${lineDrawDurationS}s`,
          "--zodiac-twinkle": `${twinkleDurationS}s`,
          "--zodiac-path-length": pathLength,
        } as CSSProperties
      }
      aria-hidden
    >
      <div className="zodiac-const__nebula" />
      <div className="zodiac-const__ring" />
      <div className="zodiac-const__dust">
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} className="zodiac-const__speck" style={{ "--i": i } as CSSProperties} />
        ))}
      </div>

      <svg className="zodiac-const__svg" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={gradId} x1="20" y1="20" x2="180" y2="180" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(255, 248, 240, 0.12)" />
            <stop offset="40%" stopColor="rgba(240, 200, 150, 0.55)" />
            <stop offset="75%" stopColor="rgba(255, 248, 240, 0.78)" />
            <stop offset="100%" stopColor="rgba(232, 168, 92, 0.32)" />
          </linearGradient>
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          key={pathD}
          className="zodiac-const__path"
          d={pathD}
          stroke={`url(#${gradId})`}
          strokeWidth="1.15"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${glowId})`}
          style={{ "--zodiac-path-length": pathLength } as CSSProperties}
        />
      </svg>

      <div className="zodiac-const__stars">
        {stars.map((star, i) => (
          <span
            key={`${westernZodiac}-${i}`}
            className={`zodiac-const__star${i === accentIndex ? " is-accent" : ""}`}
            style={
              {
                left: `${star.x}%`,
                top: `${star.y}%`,
                "--star-size": `${star.size}px`,
                "--star-delay": `${starAppearDelay(i, starStaggerMs)}s`,
                "--star-i": i,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
