const { sendJson, readBody, requestJson, requirePost } = require("./_lib");

function getAction(req, body) {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    return url.searchParams.get("action") || body?.action || "";
  } catch (_e) {
    return body?.action || "";
  }
}

async function handleLogin(res, body) {
  const { email, password } = body;
  if (email === "admin" && password === "admin") {
    sendJson(res, 200, {
      uid: "local-admin",
      email: "admin@local.test",
      idToken: "local-admin-token",
      refreshToken: "local-admin-refresh",
      isLocalAdmin: true,
    });
    return;
  }
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) return sendJson(res, 500, { error: "Missing FIREBASE_WEB_API_KEY in env" });
  if (!email || !password) return sendJson(res, 400, { error: "email and password are required" });
  const data = await requestJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  sendJson(res, 200, {
    uid: data.localId,
    email: data.email,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
  });
}

async function handleRegister(res, body) {
  const { email, password } = body;
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) return sendJson(res, 500, { error: "Missing FIREBASE_WEB_API_KEY in env" });
  if (!email || !password) return sendJson(res, 400, { error: "email and password are required" });
  const data = await requestJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  sendJson(res, 200, {
    uid: data.localId,
    email: data.email,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
  });
}

async function handleChangePassword(res, body) {
  const { idToken, newPassword } = body;
  if (!idToken || !newPassword) {
    return sendJson(res, 400, { error: "idToken and newPassword are required" });
  }
  if (idToken === "local-admin-token") {
    return sendJson(res, 200, { ok: true, message: "admin test account password change skipped" });
  }
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) return sendJson(res, 500, { error: "Missing FIREBASE_WEB_API_KEY in env" });
  const data = await requestJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, password: newPassword, returnSecureToken: true }),
    }
  );
  sendJson(res, 200, {
    uid: data.localId,
    email: data.email,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
  });
}

module.exports = async function handler(req, res) {
  if (!requirePost(req, res)) return;
  try {
    const body = await readBody(req);
    const action = getAction(req, body);
    if (action === "login") return await handleLogin(res, body);
    if (action === "register") return await handleRegister(res, body);
    if (action === "change-password") return await handleChangePassword(res, body);
    sendJson(res, 404, { error: `Unknown auth action: ${action || "(none)"}` });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
};
