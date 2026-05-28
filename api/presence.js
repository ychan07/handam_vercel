const { sendJson, readBody, requirePost } = require("../_lib");
const { touchPresence, hasFirebaseAdmin } = require("../_adminCore");

module.exports = async function handler(req, res) {
  if (!requirePost(req, res)) return;
  try {
    const { uid, email, displayName, phone } = await readBody(req);
    if (!uid) return sendJson(res, 400, { error: "uid is required" });
    if (hasFirebaseAdmin()) {
      await touchPresence(uid, { email: email || null, displayName: displayName || null, phone: phone || null });
    }
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
};
