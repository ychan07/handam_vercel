const { sendJson, readBody, requirePost } = require("./_lib");
const {
  verifyAdminToken,
  adminLogin,
  changeAdminCredentials,
  getAdminStats,
  getAdminUsers,
  resetUserPassword,
  setUserDisabled,
  deleteUser,
  createPasswordResetLink,
  touchPresence,
  hasFirebaseAdmin,
} = require("./_adminCore");

function getAction(req, body) {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    return url.searchParams.get("action") || body?.action || "";
  } catch (_e) {
    return body?.action || "";
  }
}

module.exports = async function handler(req, res) {
  if (!requirePost(req, res)) return;
  let action = "";
  try {
    const body = await readBody(req);
    action = getAction(req, body);

    if (action === "login") {
      const { username, password } = body;
      if (!username || !password) return sendJson(res, 400, { error: "username and password are required" });
      const data = await adminLogin(username, password);
      return sendJson(res, 200, data);
    }

    if (action === "presence") {
      const { uid, email, displayName } = body;
      if (!uid) return sendJson(res, 400, { error: "uid is required" });
      if (hasFirebaseAdmin()) {
        await touchPresence(uid, { email: email || null, displayName: displayName || null });
      }
      return sendJson(res, 200, { ok: true });
    }

    const { adminToken } = body;
    if (action !== "login" && action !== "presence") {
      if (!verifyAdminToken(adminToken)) return sendJson(res, 401, { error: "관리자 인증이 필요합니다." });
    }

    if (action === "stats") {
      return sendJson(res, 200, await getAdminStats());
    }
    if (action === "users") {
      const users = await getAdminUsers();
      return sendJson(res, 200, { users });
    }
    if (action === "reset-password") {
      const { uid, newPassword } = body;
      return sendJson(res, 200, await resetUserPassword(uid, newPassword));
    }
    if (action === "credentials") {
      const { currentPassword, newUsername, newPassword } = body;
      const data = await changeAdminCredentials(adminToken, currentPassword, newUsername, newPassword);
      return sendJson(res, 200, data);
    }
    if (action === "toggle-user") {
      const { uid, disabled } = body;
      return sendJson(res, 200, await setUserDisabled(uid, Boolean(disabled)));
    }
    if (action === "delete-user") {
      const { uid } = body;
      return sendJson(res, 200, await deleteUser(uid));
    }
    if (action === "reset-link") {
      const { email } = body;
      return sendJson(res, 200, await createPasswordResetLink(email));
    }

    sendJson(res, 404, { error: `Unknown admin action: ${action || "(none)"}` });
  } catch (error) {
    if (action === "login") {
      return sendJson(res, 401, { error: error.message || "Unauthorized" });
    }
    const status = /비밀번호|아이디|필요/.test(error.message || "") ? 400 : 500;
    sendJson(res, status, { error: error.message || "Server error" });
  }
};
