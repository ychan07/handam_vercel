const assert = require("node:assert/strict");
const handler = require("../api/services");

function createResponse() {
  return {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function invoke(action, body) {
  const res = createResponse();
  await handler({ method: "POST", url: `/api/services?action=${action}`, body }, res);
  return res;
}

async function main() {
  const originalFetch = global.fetch;
  const originalEnv = {
    CLOVA_OCR_INVOKE_URL: process.env.CLOVA_OCR_INVOKE_URL,
    CLOVA_OCR_SECRET: process.env.CLOVA_OCR_SECRET,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
  };

  try {
    process.env.CLOVA_OCR_INVOKE_URL = "https://ocr.example.test/general";
    process.env.CLOVA_OCR_SECRET = "test-ocr-secret";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";

    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url: String(url), options });
      const responseBody = calls.length === 1
        ? {
            images: [{
              fields: [
                { inferText: "오늘은", lineBreak: true, boundingPoly: { vertices: [{ x: 0, y: 0 }] } },
                { inferText: "맑음", lineBreak: false, boundingPoly: { vertices: [{ x: 0, y: 50 }] } },
              ],
            }],
          }
        : {
            candidates: [{ content: { parts: [{ text: JSON.stringify({ cleanedText: "오늘은 맑음.", summary: "맑은 하루를 기록했다." }) }] } }],
          };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(responseBody),
      };
    };

    const ocr = await invoke("ocr", { imageBase64: "dGVzdA==", format: "jpg" });
    assert.equal(ocr.statusCode, 200);
    assert.equal(ocr.body.text, "오늘은\n맑음");
    assert.equal(calls[0].url, process.env.CLOVA_OCR_INVOKE_URL);
    assert.equal(calls[0].options.headers["X-OCR-SECRET"], process.env.CLOVA_OCR_SECRET);
    const ocrPayload = JSON.parse(calls[0].options.body);
    assert.equal(ocrPayload.version, "V2");
    assert.equal(ocrPayload.lang, "ko");
    assert.equal(ocrPayload.images[0].data, "dGVzdA==");

    const summary = await invoke("summarize", {
      text: "오늘은 맑음",
      persona: "담백한 정리형",
      quality: "고급",
    });
    assert.equal(summary.statusCode, 200);
    assert.equal(summary.body.persona, "담백한 정리형");
    assert.equal(summary.body.model, "gemini-2.5-flash");
    assert.equal(summary.body.summary, "맑은 하루를 기록했다.");
    assert.match(calls[1].url, /models\/gemini-2\.5-flash:generateContent/);
    assert.equal(calls[1].options.headers["x-goog-api-key"], process.env.GEMINI_API_KEY);
    assert.doesNotMatch(calls[1].url, /test-gemini-key/);
    assert.match(JSON.parse(calls[1].options.body).contents[0].parts[0].text, /과도한 감정 해석/);

    console.log("OCR and Gemini server adapters passed.");
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
