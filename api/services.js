const { crypto, sendJson, readBody, requestJson, requirePost } = require("./_lib");

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
    if (field.lineBreak && current) {
      lines.push(current);
      current = piece;
    } else {
      current = current ? `${current} ${piece}` : piece;
    }
  }
  if (current) lines.push(current);
  return lines.join("\n").trim();
}

async function handleOcr(res, body) {
  const { imageBase64, format: formatHint } = body;
  if (!imageBase64) return sendJson(res, 400, { error: "imageBase64 is required" });
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
    images: [{ format, name: "diary", data: imageBase64 }],
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
  sendJson(res, 200, { text, raw: data });
}

async function handleSummarize(res, body) {
  const { text, persona = "따뜻한 공감형" } = body;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return sendJson(res, 500, { error: "Missing GEMINI_API_KEY in env" });
  if (!text) return sendJson(res, 400, { error: "text is required" });
  const prompt = [
    "당신은 한국어 일기 도우미입니다.",
    `페르소나: ${persona}`,
    "입력 텍스트를 맞춤법/문장 부호를 자연스럽게 정리하고, 핵심을 한 줄로 요약하세요.",
    "JSON만 반환하세요. 형식: {\"cleanedText\":\"...\",\"summary\":\"...\"}",
    `입력: ${text}`,
  ].join("\n");
  const data = await requestJson(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );
  const output = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{\"cleanedText\":\"\",\"summary\":\"\"}";
  try {
    sendJson(res, 200, JSON.parse(output));
  } catch (_error) {
    sendJson(res, 200, { cleanedText: text, summary: output });
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
