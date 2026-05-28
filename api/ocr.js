const { crypto, sendJson, readBody, requestJson, requirePost } = require("./_lib");

module.exports = async function handler(req, res) {
  if (!requirePost(req, res)) return;

  try {
    const { imageBase64 } = await readBody(req);
    if (!imageBase64) return sendJson(res, 400, { error: "imageBase64 is required" });

    const invokeUrl = process.env.CLOVA_OCR_INVOKE_URL;
    const secret = process.env.CLOVA_OCR_SECRET;
    if (!invokeUrl || !secret) {
      return sendJson(res, 500, { error: "Missing CLOVA_OCR_INVOKE_URL or CLOVA_OCR_SECRET in env" });
    }

    const payload = {
      version: "V2",
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      images: [{ format: "jpg", name: "diary", data: imageBase64 }],
    };

    const data = await requestJson(invokeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-OCR-SECRET": secret },
      body: JSON.stringify(payload),
    });

    const lines = [];
    const fields = data?.images?.[0]?.fields || [];
    for (const field of fields) if (field?.inferText) lines.push(field.inferText);
    sendJson(res, 200, { text: lines.join(" ").trim(), raw: data });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
};
