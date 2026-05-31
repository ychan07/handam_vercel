/** 서양 12궁 별자리 — viewBox 0~200 좌표계, 별은 % (0~100) */

export type ConstellationStar = {
  /** 0~100, 가로 위치(%) */
  x: number;
  /** 0~100, 세로 위치(%) */
  y: number;
  size: number;
};

export type ZodiacConstellationArt = {
  stars: ConstellationStar[];
  /** SVG path (viewBox 0 0 200 200) */
  pathD: string;
  /** stroke-dasharray 애니메이션용 대략적 길이 */
  pathLength: number;
  /** 강조할 주성 인덱스 */
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

function art(
  stars: Array<[x: number, y: number, size: number]>,
  pathD: string,
  pathLength: number,
  accentIndex: number
): ZodiacConstellationArt {
  return {
    stars: stars.map(([x, y, size], i) => ({ x, y, size })),
    pathD,
    pathLength,
    accentIndex,
  };
}

/** 각 궁의 상징적 별자리 실루엣 (천문도 단순화) */
export const ZODIAC_CONSTELLATIONS: Record<WesternZodiacName, ZodiacConstellationArt> = {
  /** 양자리 — 뿔 호(arc) */
  양자리: art(
    [
      [52, 38, 4],
      [62, 28, 4.5],
      [74, 30, 5],
      [82, 42, 4],
      [76, 56, 3.5],
    ],
    "M 104 76 Q 128 56 148 60 L 164 84 L 152 112",
    118,
    2
  ),

  /** 황소자리 — V자(알데바란·히아데스군) */
  황소자리: art(
    [
      [50, 32, 5],
      [34, 54, 4],
      [66, 54, 4],
      [50, 68, 3.5],
      [42, 84, 3.5],
    ],
    "M 100 64 L 68 108 L 132 108 Z M 100 64 L 100 136 L 84 168",
    195,
    0
  ),

  /** 쌍둥이자리 — 쌍둥이 기둥 */
  쌍둥이자리: art(
    [
      [40, 24, 4],
      [40, 48, 3.5],
      [40, 72, 4],
      [60, 24, 4],
      [60, 48, 3.5],
      [60, 72, 4],
    ],
    "M 80 48 L 80 96 L 80 144 M 120 48 L 120 96 L 120 144 M 80 48 L 120 48 M 100 76 L 100 116",
    248,
    0
  ),

  /** 게자리 — 거꾸로 Y */
  게자리: art(
    [
      [50, 28, 4.5],
      [34, 52, 4],
      [66, 52, 4],
      [50, 72, 3.5],
      [50, 88, 3.5],
    ],
    "M 100 56 L 68 104 L 132 104 M 100 56 L 100 144 L 100 176",
    210,
    0
  ),

  /** 사자자리 — 낫(sickle) */
  사자자리: art(
    [
      [28, 52, 3.5],
      [36, 36, 4],
      [48, 28, 4.5],
      [58, 32, 4],
      [64, 46, 4],
      [56, 60, 3.5],
      [42, 64, 3.5],
    ],
    "M 56 104 L 72 72 L 96 56 L 116 64 L 128 92 L 112 120 L 84 128",
    195,
    2
  ),

  /** 처녀자리 — Y + 긴 줄기(스피카) */
  처녀자리: art(
    [
      [50, 22, 4],
      [34, 48, 4],
      [66, 48, 4],
      [50, 64, 3.5],
      [50, 86, 5],
    ],
    "M 100 44 L 68 96 L 132 96 M 100 44 L 100 128 L 100 172",
    215,
    4
  ),

  /** 천칭자리 — 저울 다이아몬드 */
  천칭자리: art(
    [
      [50, 26, 4.5],
      [32, 50, 4],
      [68, 50, 4],
      [50, 72, 4],
      [50, 50, 3],
    ],
    "M 100 52 L 64 100 L 100 144 L 136 100 Z",
    175,
    0
  ),

  /** 전갈자리 — J자 꼬리(안타레스) */
  전갈자리: art(
    [
      [18, 34, 3.5],
      [28, 42, 4],
      [38, 52, 4],
      [48, 62, 4.5],
      [56, 74, 4],
      [64, 86, 4],
      [72, 98, 4.5],
    ],
    "M 36 68 L 56 84 L 76 104 L 96 124 L 112 148 L 128 172 L 144 196",
    235,
    3
  ),

  /** 사수자리 — 주전자(teapot) */
  사수자리: art(
    [
      [44, 42, 4],
      [56, 42, 3.5],
      [62, 54, 4],
      [56, 66, 3.5],
      [44, 66, 3.5],
      [36, 56, 3.5],
      [70, 50, 4],
    ],
    "M 88 84 L 112 84 L 124 108 L 112 132 L 88 132 L 76 108 Z M 76 108 L 72 112 M 124 108 L 140 100",
    195,
    2
  ),

  /** 염소자리 — 삼각형 */
  염소자리: art(
    [
      [50, 30, 5],
      [28, 72, 4],
      [72, 72, 4],
      [44, 54, 3.5],
    ],
    "M 100 60 L 56 144 L 144 144 Z M 100 60 L 88 108",
    168,
    0
  ),

  /** 물병자리 — 지그재그 물줄기 */
  물병자리: art(
    [
      [28, 38, 4],
      [44, 50, 3.5],
      [36, 66, 4],
      [54, 60, 3.5],
      [66, 76, 4],
      [52, 90, 4],
    ],
    "M 56 76 L 88 100 L 72 132 L 108 120 L 132 152 L 104 180",
    210,
    2
  ),

  /** 물고기자리 — 쌍어 + 연결줄 */
  물고기자리: art(
    [
      [26, 42, 4],
      [38, 32, 3.5],
      [48, 44, 4],
      [52, 72, 4],
      [64, 62, 3.5],
      [74, 74, 4],
      [50, 58, 3],
    ],
    "M 52 84 L 76 64 L 96 88 M 104 144 L 128 124 L 148 150 M 96 88 L 104 116 L 104 144",
    228,
    3
  ),
};

const FALLBACK = ZODIAC_CONSTELLATIONS.양자리;

export function getZodiacConstellation(westernZodiac: string): ZodiacConstellationArt {
  if (westernZodiac in ZODIAC_CONSTELLATIONS) {
    return ZODIAC_CONSTELLATIONS[westernZodiac as WesternZodiacName];
  }
  return FALLBACK;
}

/** 별 순차 등장 delay(초) */
export function starAppearDelay(index: number, staggerMs: number): number {
  return (index * staggerMs) / 1000;
}
