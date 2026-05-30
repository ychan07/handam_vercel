const http = require("http");
const fs = require("fs");
const path = require("path");

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

const authHandler = require("./api/auth");
const adminHandler = require("./api/admin");
const servicesHandler = require("./api/services");

const API_ROUTE_MAP = {
  "/api/auth/login": [authHandler, "/api/auth", "login"],
  "/api/auth/register": [authHandler, "/api/auth", "register"],
  "/api/auth/change-password": [authHandler, "/api/auth", "change-password"],
  "/api/admin/login": [adminHandler, "/api/admin", "login"],
  "/api/admin/stats": [adminHandler, "/api/admin", "stats"],
  "/api/admin/users": [adminHandler, "/api/admin", "users"],
  "/api/admin/reset-password": [adminHandler, "/api/admin", "reset-password"],
  "/api/admin/credentials": [adminHandler, "/api/admin", "credentials"],
  "/api/admin/toggle-user": [adminHandler, "/api/admin", "toggle-user"],
  "/api/admin/delete-user": [adminHandler, "/api/admin", "delete-user"],
  "/api/admin/reset-link": [adminHandler, "/api/admin", "reset-link"],
  "/api/presence": [adminHandler, "/api/admin", "presence"],
  "/api/ocr": [servicesHandler, "/api/services", "ocr"],
  "/api/llm/summarize": [servicesHandler, "/api/services", "summarize"],
  "/api/fortune": [servicesHandler, "/api/services", "fortune"],
};

async function handleApi(req, res, url) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return true;
  }

  const route = API_ROUTE_MAP[url.pathname];
  if (route) {
    const [handler, basePath, action] = route;
    req.url = `${basePath}?action=${encodeURIComponent(action)}`;
    await handler(req, res);
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
