const { crypto, sendJson, readBody, requestJson, requirePost } = require("./_lib");
const { resolvePersona } = require("./personas");

const GEMINI_MODEL_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;
const SUMMARY_QUALITIES = new Set(["표준", "고급", "최고"]);

function getGeminiModel() {
  const configured = String(process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
  return GEMINI_MODEL_PATTERN.test(configured) ? configured : "gemini-2.5-flash";
}

function getAction(req, body) {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    return url.searchParams.get("action") || body?.action || "";
  } catch (_e) {
    return body?.action || "";
  }
}

function fieldSortKey(field) {
  const vertices = field?.boundingPoly?.vertices;
  if (!Array.isArray(vertices) || !vertices.length) return [0, 0];
  const ys = vertices.map((v) => Number(v?.y) || 0);
  const xs = vertices.map((v) => Number(v?.x) || 0);
  return [Math.min(...ys), Math.min(...xs)];
}

function extractOcrText(data) {
  const fields = (data?.images?.[0]?.fields || []).filter((f) => f?.inferText);
  fields.sort((a, b) => {
    const [ay, ax] = fieldSortKey(a);
    const [by, bx] = fieldSortKey(b);
    if (ay !== by) return ay - by;
    return ax - bx;
  });
  const lines = [];
  let current = "";
  for (const field of fields) {
    const piece = String(field.inferText).trim();
    if (!piece) continue;
    current = current ? `${current} ${piece}` : piece;
    if (field.lineBreak) {
      lines.push(current);
      current = "";
    }
  }
  if (current) lines.push(current);
  return lines.join("\n").trim();
}

async function handleOcr(res, body) {
  const imageBase64 = String(body.imageBase64 || "").trim();
  const formatHint = body.format;
  if (!imageBase64) return sendJson(res, 400, { error: "imageBase64 is required" });
  if (imageBase64.length > 4_500_000) {
    return sendJson(res, 413, { error: "OCR 이미지는 4.5MB 이하로 업로드해 주세요." });
  }
  const invokeUrl = process.env.CLOVA_OCR_INVOKE_URL;
  const secret = process.env.CLOVA_OCR_SECRET;
  if (!invokeUrl || !secret) {
    return sendJson(res, 500, { error: "Missing CLOVA_OCR_INVOKE_URL or CLOVA_OCR_SECRET in env" });
  }
  const format = formatHint === "png" ? "png" : "jpg";
  const payload = {
    version: "V2",
    requestId: crypto.randomUUID(),
    timestamp: Date.now(),
    lang: "ko",
    images: [{ format, name: "diary", data: imageBase64 }],
    enableTableDetection: false,
  };
  const data = await requestJson(invokeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-OCR-SECRET": secret },
    body: JSON.stringify(payload),
  });
  const text = extractOcrText(data);
  if (!text) {
    return sendJson(res, 422, { error: "인식된 글자가 없어요. 밝은 곳에서 다시 촬영해 주세요." });
  }
  sendJson(res, 200, { text });
}

async function handleSummarize(res, body) {
  const text = String(body.text || "").trim();
  const persona = resolvePersona(String(body.persona || ""));
  const quality = SUMMARY_QUALITIES.has(body.quality) ? body.quality : "고급";
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return sendJson(res, 500, { error: "Missing GEMINI_API_KEY in env" });
  if (!text) return sendJson(res, 400, { error: "text is required" });
  if (text.length > 200_000) return sendJson(res, 413, { error: "요약할 글이 너무 깁니다." });
  const model = getGeminiModel();
  const prompt = [
    "당신은 한국어 일기 도우미입니다.",
    `페르소나: ${persona.name}`,
    `행동 지침: ${persona.instruction}`,
    `요약 정확도: ${quality}`,
    "원문의 개인정보나 민감한 내용을 새로 추측하거나 만들어내지 마세요.",
    "입력 텍스트를 맞춤법/문장 부호를 자연스럽게 정리하고, 핵심을 한 줄로 요약하세요.",
    "JSON만 반환하세요. 형식: {\"cleanedText\":\"...\",\"summary\":\"...\"}",
    `입력: ${text}`,
  ].join("\n");
  const data = await requestJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );
  const output = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{\"cleanedText\":\"\",\"summary\":\"\"}";
  try {
    const parsed = JSON.parse(output);
    sendJson(res, 200, {
      cleanedText: String(parsed.cleanedText || text),
      summary: String(parsed.summary || ""),
      persona: persona.name,
      quality,
      model,
    });
  } catch (_error) {
    sendJson(res, 200, {
      cleanedText: text,
      summary: String(output),
      persona: persona.name,
      quality,
      model,
    });
  }
}

async function handleFortune(res, body) {
  const { birthday } = body;
  const urlTemplate = process.env.FORTUNE_API_URL;
  if (!urlTemplate) return sendJson(res, 500, { error: "Missing FORTUNE_API_URL in env" });
  const endpoint = urlTemplate.includes("{birthday}")
    ? urlTemplate.replace("{birthday}", encodeURIComponent(String(birthday || "")))
    : urlTemplate;
  const data = await requestJson(endpoint, { method: "GET" });
  sendJson(res, 200, data);
}

module.exports = async function handler(req, res) {
  if (!requirePost(req, res)) return;
  try {
    const body = await readBody(req);
    const action = getAction(req, body);
    if (action === "ocr") return await handleOcr(res, body);
    if (action === "summarize") return await handleSummarize(res, body);
    if (action === "fortune") return await handleFortune(res, body);
    sendJson(res, 404, { error: `Unknown services action: ${action || "(none)"}` });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
};
