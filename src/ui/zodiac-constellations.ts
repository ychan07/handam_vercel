/**
 * 서양 12궁 별자리 — IAU 천문도 연결선 + HYG J2000 좌표
 *
 * 데이터: zodiac-constellations.generated.ts (자동 생성)
 * 재생성: node scripts/generate-zodiac-constellations.mjs
 *
 * 출처
 * - IAU stick figures (Alan MacRobert / Sky & Telescope, IAU website)
 *   via dcf21/constellation-stick-figures (CC BY 4.0)
 * - HYG Database v37 (J2000 RA, Dec, magnitude)
 */

export type ConstellationStar = {
  x: number;
  y: number;
  size: number;
};

export type ZodiacConstellationArt = {
  stars: ConstellationStar[];
  pathD: string;
  pathLength: number;
  accentIndex: number;
};

export const WESTERN_ZODIAC_ORDER = [
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

export type WesternZodiacName = (typeof WESTERN_ZODIAC_ORDER)[number];

import { ZODIAC_CONSTELLATIONS_GENERATED } from "./zodiac-constellations.generated";

export const ZODIAC_CONSTELLATIONS = ZODIAC_CONSTELLATIONS_GENERATED as Record<
  WesternZodiacName,
  ZodiacConstellationArt
>;

const FALLBACK = ZODIAC_CONSTELLATIONS.양자리;

export function getZodiacConstellation(westernZodiac: string): ZodiacConstellationArt {
  if (westernZodiac in ZODIAC_CONSTELLATIONS) {
    return ZODIAC_CONSTELLATIONS[westernZodiac as WesternZodiacName];
  }
  return FALLBACK;
}

export function starAppearDelay(index: number, staggerMs: number): number {
  return (index * staggerMs) / 1000;
}
