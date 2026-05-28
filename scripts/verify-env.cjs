const fs = require("fs");
const path = require("path");

const envPath = path.join(process.cwd(), ".env");
const requiredKeys = [
  "FIREBASE_WEB_API_KEY",
  "CLOVA_OCR_INVOKE_URL",
  "CLOVA_OCR_SECRET",
  "GEMINI_API_KEY",
  "FORTUNE_API_URL",
];

if (!fs.existsSync(envPath)) {
  console.error("Missing .env file in project root.");
  console.error("Create it from .env.example first.");
  process.exit(1);
}

const envMap = {};
const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx <= 0) continue;
  const key = trimmed.slice(0, idx).trim();
  const value = trimmed.slice(idx + 1).trim();
  envMap[key] = value;
}

const missing = requiredKeys.filter((key) => !envMap[key]);
if (missing.length > 0) {
  console.error("Missing required env keys:");
  for (const key of missing) console.error(`- ${key}`);
  process.exit(1);
}

if (!envMap.FORTUNE_API_URL.includes("{birthday}")) {
  console.warn("Warning: FORTUNE_API_URL does not include {birthday} placeholder.");
}

console.log("Environment looks good.");
