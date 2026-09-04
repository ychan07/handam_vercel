const { sendJson, readBody, requirePost } = require("./_lib");
const {
  verifyAdminToken,
  adminLogin,
  changeAdminCredentials,
  getAdminStats,
  getAdminUsers,
  getAdminOverview,
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

    const force = Boolean(body?.refresh);
    if (action === "overview") {
      return sendJson(res, 200, await getAdminOverview(force));
    }
    if (action === "stats") {
      return sendJson(res, 200, await getAdminStats(force));
    }
    if (action === "users") {
      const users = await getAdminUsers(force);
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
    const msg = error.message || "Server error";
    const status = /비밀번호|아이디|필요|만료/.test(msg) ? 400 : 500;
    const friendly =
      /EROFS|read-only|EPERM|EACCES/i.test(msg)
        ? "서버 저장소 오류로 표시됐지만, 변경이 반영됐을 수 있어요. 새 아이디·비밀번호로 다시 로그인해 보세요."
        : msg;
    sendJson(res, status, { error: friendly });
  }
};
