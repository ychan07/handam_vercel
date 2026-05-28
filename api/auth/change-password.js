const { sendJson, readBody, requestJson, requirePost } = require("../_lib");

module.exports = async function handler(req, res) {
  if (!requirePost(req, res)) return;

  try {
    const { idToken, newPassword } = await readBody(req);
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
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
};
