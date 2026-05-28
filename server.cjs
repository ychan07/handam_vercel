const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, "utf-8");
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const host = "127.0.0.1";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    req.on("data", (chunk) => {
      buffer += chunk.toString();
      if (buffer.length > 5 * 1024 * 1024) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!buffer) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(buffer));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { raw: text };
  }

  if (!response.ok) {
    const message =
      data?.error?.message || data?.message || `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return data;
}

async function handleApi(req, res, url) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return true;
  }

  try {
    if (url.pathname === "/api/auth/login") {
      const { email, password } = await readBody(req);
      if (email === "admin" && password === "admin") {
        sendJson(res, 200, {
          uid: "local-admin",
          email: "admin@local.test",
          idToken: "local-admin-token",
          refreshToken: "local-admin-refresh",
          isLocalAdmin: true,
        });
        return true;
      }
      const apiKey = process.env.FIREBASE_WEB_API_KEY;
      if (!apiKey) {
        sendJson(res, 500, { error: "Missing FIREBASE_WEB_API_KEY in .env" });
        return true;
      }
      if (!email || !password) {
        sendJson(res, 400, { error: "email and password are required" });
        return true;
      }

      const data = await requestJson(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            returnSecureToken: true,
          }),
        }
      );

      sendJson(res, 200, {
        uid: data.localId,
        email: data.email,
        idToken: data.idToken,
        refreshToken: data.refreshToken,
      });
      return true;
    }

    if (url.pathname === "/api/auth/register") {
      const { email, password } = await readBody(req);
      const apiKey = process.env.FIREBASE_WEB_API_KEY;
      if (!apiKey) {
        sendJson(res, 500, { error: "Missing FIREBASE_WEB_API_KEY in .env" });
        return true;
      }
      if (!email || !password) {
        sendJson(res, 400, { error: "email and password are required" });
        return true;
      }

      const data = await requestJson(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            returnSecureToken: true,
          }),
        }
      );

      sendJson(res, 200, {
        uid: data.localId,
        email: data.email,
        idToken: data.idToken,
        refreshToken: data.refreshToken,
      });
      return true;
    }

    if (url.pathname === "/api/auth/change-password") {
      const { idToken, newPassword } = await readBody(req);
      if (!idToken || !newPassword) {
        sendJson(res, 400, { error: "idToken and newPassword are required" });
        return true;
      }
      if (idToken === "local-admin-token") {
        sendJson(res, 200, { ok: true, message: "admin test account password change skipped" });
        return true;
      }
      const apiKey = process.env.FIREBASE_WEB_API_KEY;
      if (!apiKey) {
        sendJson(res, 500, { error: "Missing FIREBASE_WEB_API_KEY in .env" });
        return true;
      }
      const data = await requestJson(
        `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idToken,
            password: newPassword,
            returnSecureToken: true,
          }),
        }
      );
      sendJson(res, 200, {
        uid: data.localId,
        email: data.email,
        idToken: data.idToken,
        refreshToken: data.refreshToken,
      });
      return true;
    }

    if (url.pathname === "/api/ocr") {
      const { imageBase64 } = await readBody(req);
      if (!imageBase64) {
        sendJson(res, 400, { error: "imageBase64 is required" });
        return true;
      }

      const invokeUrl = process.env.CLOVA_OCR_INVOKE_URL;
      const secret = process.env.CLOVA_OCR_SECRET;
      if (!invokeUrl || !secret) {
        sendJson(res, 500, {
          error: "Missing CLOVA_OCR_INVOKE_URL or CLOVA_OCR_SECRET in .env",
        });
        return true;
      }

      const payload = {
        version: "V2",
        requestId: crypto.randomUUID(),
        timestamp: Date.now(),
        images: [
          {
            format: "jpg",
            name: "diary",
            data: imageBase64,
          },
        ],
      };

      const data = await requestJson(invokeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OCR-SECRET": secret,
        },
        body: JSON.stringify(payload),
      });

      const lines = [];
      const fields = data?.images?.[0]?.fields || [];
      for (const field of fields) {
        if (field?.inferText) lines.push(field.inferText);
      }

      sendJson(res, 200, {
        text: lines.join(" ").trim(),
        raw: data,
      });
      return true;
    }

    if (url.pathname === "/api/llm/summarize") {
      const { text, persona = "따뜻한 공감형" } = await readBody(req);
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        sendJson(res, 500, { error: "Missing GEMINI_API_KEY in .env" });
        return true;
      }
      if (!text) {
        sendJson(res, 400, { error: "text is required" });
        return true;
      }

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
            generationConfig: {
              responseMimeType: "application/json",
            },
          }),
        }
      );

      const output =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "{\"cleanedText\":\"\",\"summary\":\"\"}";
      let parsed;
      try {
        parsed = JSON.parse(output);
      } catch (error) {
        parsed = { cleanedText: text, summary: output };
      }
      sendJson(res, 200, parsed);
      return true;
    }

    if (url.pathname === "/api/fortune") {
      const { birthday } = await readBody(req);
      const urlTemplate = process.env.FORTUNE_API_URL;
      if (!urlTemplate) {
        sendJson(res, 500, { error: "Missing FORTUNE_API_URL in .env" });
        return true;
      }

      const endpoint = urlTemplate.includes("{birthday}")
        ? urlTemplate.replace("{birthday}", encodeURIComponent(String(birthday || "")))
        : urlTemplate;
      const data = await requestJson(endpoint, { method: "GET" });
      sendJson(res, 200, data);
      return true;
    }
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
    return true;
  }

  return false;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${host}:${port}`);

  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url);
    return;
  }

  const requestedPath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const filePath = path.resolve(root, requestedPath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
    });
    res.end(data);
  });
});

server.listen(port, host, () => {
  console.log(`Handam webapp running at http://${host}:${port}`);
});
