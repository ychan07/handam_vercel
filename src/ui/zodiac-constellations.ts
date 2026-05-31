/**
 * 서양 12궁 별자리 — IAU 천문도 연결선 + HYG J2000 좌표
 * 재생성: npm run generate:constellations
 */

import { ZODIAC_CONSTELLATIONS_BY_IAU } from "./zodiac-constellations.generated";

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

/** 한국어 궁 이름 → IAU 영문 별자리명 */
export const ZODIAC_KO_TO_IAU: Record<WesternZodiacName, keyof typeof ZODIAC_CONSTELLATIONS_BY_IAU> = {
  양자리: "Aries",
  황소자리: "Taurus",
  쌍둥이자리: "Gemini",
  게자리: "Cancer",
  사자자리: "Leo",
  처녀자리: "Virgo",
  천칭자리: "Libra",
  전갈자리: "Scorpius",
  사수자리: "Sagittarius",
  염소자리: "Capricornus",
  물병자리: "Aquarius",
  물고기자리: "Pisces",
};

const FALLBACK_IAU = "Aries";

export function getZodiacConstellation(westernZodiac: string): ZodiacConstellationArt {
  const ko = westernZodiac.trim() as WesternZodiacName;
  const iau = ZODIAC_KO_TO_IAU[ko];
  if (iau && Object.hasOwn(ZODIAC_CONSTELLATIONS_BY_IAU, iau)) {
    return ZODIAC_CONSTELLATIONS_BY_IAU[iau];
  }
  return ZODIAC_CONSTELLATIONS_BY_IAU[FALLBACK_IAU];
}

export function starAppearDelay(index: number, staggerMs: number): number {
  return (index * staggerMs) / 1000;
}
