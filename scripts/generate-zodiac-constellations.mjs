/**
 * IAU stick figures (dcf21/constellation-stick-figures, CC BY 4.0 / GPL)
 * + HYG Database v3 (J2000 RA/Dec, magnitude)
 * → src/ui/zodiac-constellations.generated.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";
import http from "http";
import zlib from "zlib";
import { createInterface } from "readline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const ZODIAC_IAU = {
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

const IAU_URL =
  "https://raw.githubusercontent.com/dcf21/constellation-stick-figures/master/constellation_lines_iau.dat";
const HYG_URL =
  "https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/v3/hyg_v37.csv.gz";

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith("https") ? https.get : http.get;
    get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchText(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    }).on("error", reject);
  });
}

function fetchGzipCsvLines(url) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith("https") ? https.get : http.get;
    get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchGzipCsvLines(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const lines = [];
      const rl = createInterface({
        input: res.pipe(zlib.createGunzip()),
        crlfDelay: Infinity,
      });
      rl.on("line", (line) => lines.push(line));
      rl.on("close", () => resolve(lines));
      rl.on("error", reject);
    }).on("error", reject);
  });
}

function parseIauLines(text) {
  const out = {};
  let current = null;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.startsWith("* ")) {
      current = t.slice(2).trim();
      if (!out[current]) out[current] = [];
    } else if (t.startsWith("[") && current) {
      const hips = JSON.parse(t).map((h) => String(h).replace(/\*$/, ""));
      out[current].push(hips);
    }
  }
  return out;
}

function buildHipMapFromCsvLines(lines, neededHips) {
  const header = lines[0].split(",");
  const hipIdx = header.indexOf("hip");
  const raIdx = header.indexOf("ra");
  const decIdx = header.indexOf("dec");
  const magIdx = header.indexOf("mag");
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const hip = cols[hipIdx];
    if (!hip || !neededHips.has(hip)) continue;
    map.set(hip, {
      ra: Number(cols[raIdx]),
      dec: Number(cols[decIdx]),
      mag: Number(cols[magIdx]),
    });
    if (map.size >= neededHips.size) break;
  }
  return map;
}

function collectNeededHips(iau, zodiacEnglish) {
  const needed = new Set();
  for (const en of zodiacEnglish) {
    for (const poly of iau[en] || []) {
      for (const hip of poly) needed.add(String(hip).replace(/\*$/, ""));
    }
  }
  return needed;
}

function gnomonicProject(stars, viewSize = 200, pad = 16) {
  const raRad = stars.map((s) => (s.ra * Math.PI) / 180);
  const decRad = stars.map((s) => (s.dec * Math.PI) / 180);
  let ra0 = raRad.reduce((a, b) => a + b, 0) / raRad.length;
  let dec0 = decRad.reduce((a, b) => a + b, 0) / decRad.length;

  const projected = stars.map((s, i) => {
    const ra = raRad[i];
    const dec = decRad[i];
    const cosC = Math.sin(dec0) * Math.sin(dec) + Math.cos(dec0) * Math.cos(dec) * Math.cos(ra - ra0);
    const x = (Math.cos(dec) * Math.sin(ra - ra0)) / cosC;
    const y = (Math.cos(dec0) * Math.sin(dec) - Math.sin(dec0) * Math.cos(dec) * Math.cos(ra - ra0)) / cosC;
    return { x, y, mag: s.mag, hip: s.hip };
  });

  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 1e-6);
  const scale = (viewSize - pad * 2) / span;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  return projected.map((p) => ({
    vx: (p.x - cx) * scale + viewSize / 2,
    vy: -(p.y - cy) * scale + viewSize / 2,
    mag: p.mag,
    hip: p.hip,
  }));
}

function magToSize(mag) {
  const m = Number.isFinite(mag) ? mag : 5;
  return Math.max(2.8, Math.min(6.8, 6.4 - m * 0.55));
}

function buildConstellation(polylines, hipMap) {
  const hipOrder = [];
  const hipSet = new Set();
  for (const poly of polylines) {
    for (const hip of poly) {
      if (!hipSet.has(hip)) {
        hipSet.add(hip);
        hipOrder.push(hip);
      }
    }
  }

  const rawStars = hipOrder.map((hip) => {
    const star = hipMap.get(hip);
    if (!star) throw new Error(`Missing HIP ${hip} in HYG`);
    return { ...star, hip };
  });

  const projected = gnomonicProject(rawStars);
  const hipToIdx = new Map(hipOrder.map((h, i) => [h, i]));

  const stars = projected.map((p) => ({
    x: Math.round((p.vx / 200) * 1000) / 10,
    y: Math.round((p.vy / 200) * 1000) / 10,
    size: Math.round(magToSize(p.mag) * 10) / 10,
  }));

  let pathD = "";
  let pathLength = 0;
  let prev = null;

  for (const poly of polylines) {
    for (let i = 0; i < poly.length; i++) {
      const idx = hipToIdx.get(poly[i]);
      const pt = projected[idx];
      if (i === 0) {
        pathD += `${pathD ? " " : ""}M ${pt.vx.toFixed(2)} ${pt.vy.toFixed(2)}`;
        prev = pt;
      } else {
        pathD += ` L ${pt.vx.toFixed(2)} ${pt.vy.toFixed(2)}`;
        if (prev) {
          pathLength += Math.hypot(pt.vx - prev.vx, pt.vy - prev.vy);
        }
        prev = pt;
      }
    }
    prev = null;
  }

  let accentIndex = 0;
  let bestMag = Infinity;
  rawStars.forEach((s, i) => {
    if (s.mag < bestMag) {
      bestMag = s.mag;
      accentIndex = i;
    }
  });

  return {
    stars,
    pathD,
    pathLength: Math.round(pathLength),
    accentIndex,
  };
}

async function main() {
  console.log("Fetching IAU constellation lines…");
  const iauText = await fetchText(IAU_URL);
  const iau = parseIauLines(iauText);

  const neededHips = collectNeededHips(iau, Object.values(ZODIAC_IAU));
  console.log(`Need ${neededHips.size} Hipparcos stars — streaming HYG v37…`);
  const hygLines = await fetchGzipCsvLines(HYG_URL);
  const hipMap = buildHipMapFromCsvLines(hygLines, neededHips);
  if (hipMap.size < neededHips.size) {
    const missing = [...neededHips].filter((h) => !hipMap.has(h));
    throw new Error(`Missing ${missing.length} HIP in HYG: ${missing.slice(0, 8).join(", ")}…`);
  }
  console.log(`Resolved ${hipMap.size} stars from HYG`);

  const result = {};
  for (const [ko, en] of Object.entries(ZODIAC_IAU)) {
    const polylines = iau[en];
    if (!polylines?.length) throw new Error(`No IAU lines for ${en}`);
    result[ko] = buildConstellation(polylines, hipMap);
    console.log(`  ${ko} (${en}): ${result[ko].stars.length} stars, path ${result[ko].pathLength}`);
  }

  const outPath = path.join(ROOT, "src", "ui", "zodiac-constellations.generated.ts");
  const body = `/** AUTO-GENERATED — do not edit by hand.
 * Sources: IAU stick figures (Alan MacRobert / IAU, via dcf21/constellation-stick-figures)
 *          HYG Database v37 (J2000 RA, Dec, magnitude)
 * Regenerate: node scripts/generate-zodiac-constellations.mjs
 */

export type GeneratedConstellationStar = { x: number; y: number; size: number };

export type GeneratedZodiacConstellationArt = {
  stars: GeneratedConstellationStar[];
  pathD: string;
  pathLength: number;
  accentIndex: number;
};

export const ZODIAC_CONSTELLATIONS_GENERATED: Record<string, GeneratedZodiacConstellationArt> = ${JSON.stringify(result, null, 2)};
`;

  fs.writeFileSync(outPath, body, "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
