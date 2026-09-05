/**
 * GET /api/plugins/time?timezone=Asia/Jakarta
 * Standalone endpoint for the World Time plugin, independent of chat.
 */

const worldtime = require("../../lib/worldtime");
const { applySecurityHeaders } = require("../../lib/security");
const { enforceRateLimit } = require("../../lib/ratelimit");

module.exports = async (req, res) => {
  applySecurityHeaders(res);
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: { code: "METHOD_NOT_ALLOWED", message: "Only GET is supported." } }));
  }
  const { limited } = await enforceRateLimit(req, res, 60);
  if (limited) {
    res.statusCode = 429;
    return res.end(JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many requests." } }));
  }

  const url = new URL(req.url, "http://internal");
  const timezone = url.searchParams.get("timezone") || "";

  try {
    const data = worldtime.getTimeInZone(timezone);
    res.end(JSON.stringify(data));
  } catch (err) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: { code: "WORLD_TIME_ERROR", message: err.message } }));
  }
};
