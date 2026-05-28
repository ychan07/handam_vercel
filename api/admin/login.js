const { sendJson, readBody, requirePost } = require("../_lib");
const { adminLogin } = require("../_adminCore");

module.exports = async function handler(req, res) {
  if (!requirePost(req, res)) return;
  try {
    const { username, password } = await readBody(req);
    if (!username || !password) return sendJson(res, 400, { error: "username and password are required" });
    const data = await adminLogin(username, password);
    sendJson(res, 200, data);
  } catch (error) {
    sendJson(res, 401, { error: error.message || "Unauthorized" });
  }
};
