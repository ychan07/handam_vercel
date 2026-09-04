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
  recordVerifiedPresence,
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
      const { idToken, displayName } = body;
      if (!idToken || typeof idToken !== "string") {
        return sendJson(res, 401, { error: "Firebase 로그인이 필요합니다." });
      }
      if (!hasFirebaseAdmin()) {
        return sendJson(res, 503, { error: "FIREBASE_SERVICE_ACCOUNT가 설정되지 않았습니다." });
      }
      return sendJson(res, 200, await recordVerifiedPresence(idToken, { displayName }));
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
    const msg = error.message || "Server error";
    if (action === "presence" && (String(error.code || "").startsWith("auth/") || /Firebase 로그인/.test(msg))) {
      return sendJson(res, 401, { error: "유효한 Firebase 로그인이 필요합니다." });
    }
    const status = /비밀번호|아이디|필요|만료/.test(msg) ? 400 : 500;
    const friendly =
      /EROFS|read-only|EPERM|EACCES/i.test(msg)
        ? "서버 저장소 오류로 표시됐지만, 변경이 반영됐을 수 있어요. 새 아이디·비밀번호로 다시 로그인해 보세요."
        : msg;
    sendJson(res, status, { error: friendly });
  }
};
