const { sendJson, readBody, requestJson, requirePost } = require("../_lib");

module.exports = async function handler(req, res) {
  if (!requirePost(req, res)) return;

  try {
    const { email, password } = await readBody(req);
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
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
};
