const crypto = require("crypto");

function sendJson(res, statusCode, body) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    res.status(statusCode).json(body);
    return;
  }
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (_error) {
      throw new Error("Invalid JSON body");
    }
  }

  return new Promise((resolve, reject) => {
    let buffer = "";
    req.on("data", (chunk) => {
      buffer += chunk.toString();
      if (buffer.length > 5 * 1024 * 1024) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      if (!buffer) return resolve({});
      try {
        resolve(JSON.parse(buffer));
      } catch (_error) {
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
  } catch (_error) {
    data = { raw: text };
  }
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function requirePost(req, res) {
  if (req.method === "POST") return true;
  sendJson(res, 405, { error: "Method not allowed" });
  return false;
}

module.exports = {
  crypto,
  sendJson,
  readBody,
  requestJson,
  requirePost,
};
