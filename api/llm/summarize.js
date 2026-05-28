const { sendJson, readBody, requestJson, requirePost } = require("../_lib");

module.exports = async function handler(req, res) {
  if (!requirePost(req, res)) return;

  try {
    const { text, persona = "따뜻한 공감형" } = await readBody(req);
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
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
};
