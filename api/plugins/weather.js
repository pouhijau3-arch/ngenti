/**
 * GET /api/plugins/weather?location=Jakarta,ID
 * Standalone endpoint for the Weather plugin, independent of chat.
 */

const weather = require("../../lib/weather");
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
  const { limited } = await enforceRateLimit(req, res, 30);
  if (limited) {
    res.statusCode = 429;
    return res.end(JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many requests." } }));
  }

  const url = new URL(req.url, "http://internal");
  const location = url.searchParams.get("location") || "";

  try {
    const data = await weather.getWeather(location);
    res.end(JSON.stringify(data));
  } catch (err) {
    res.statusCode = err.code === "WEATHER_NOT_CONFIGURED" ? 503 : 400;
    res.end(JSON.stringify({ error: { code: err.code || "WEATHER_ERROR", message: err.message } }));
  }
};
