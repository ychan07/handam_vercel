const { sendJson, readBody, requirePost } = require("../_lib");
const { verifyAdminToken, getAdminStats } = require("../_adminCore");

module.exports = async function handler(req, res) {
  if (!requirePost(req, res)) return;
  try {
    const { adminToken } = await readBody(req);
    if (!verifyAdminToken(adminToken)) return sendJson(res, 401, { error: "관리자 인증이 필요합니다." });
    const stats = await getAdminStats();
    sendJson(res, 200, stats);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
};
