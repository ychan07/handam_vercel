const { sendJson, readBody, requestJson, requirePost } = require("./_lib");

module.exports = async function handler(req, res) {
  if (!requirePost(req, res)) return;

  try {
    const { birthday } = await readBody(req);
    const urlTemplate = process.env.FORTUNE_API_URL;
    if (!urlTemplate) return sendJson(res, 500, { error: "Missing FORTUNE_API_URL in env" });

    const endpoint = urlTemplate.includes("{birthday}")
      ? urlTemplate.replace("{birthday}", encodeURIComponent(String(birthday || "")))
      : urlTemplate;
    const data = await requestJson(endpoint, { method: "GET" });
    sendJson(res, 200, data);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
};
