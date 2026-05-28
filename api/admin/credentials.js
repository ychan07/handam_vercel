const { sendJson, readBody, requirePost } = require("../_lib");
const { changeAdminCredentials } = require("../_adminCore");

module.exports = async function handler(req, res) {
  if (!requirePost(req, res)) return;
  try {
    const { adminToken, currentPassword, newUsername, newPassword } = await readBody(req);
    const data = await changeAdminCredentials(adminToken, currentPassword, newUsername, newPassword);
    sendJson(res, 200, data);
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Bad request" });
  }
};
