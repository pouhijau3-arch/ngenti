/**
 * GET /api/search?q=your+query
 * Standalone endpoint for the Web Search plugin, independent of chat.
 * Real results via Brave Search API (requires SEARCH_API_KEY).
 */

const search = require("../lib/search");
const { applySecurityHeaders } = require("../lib/security");
const { enforceRateLimit } = require("../lib/ratelimit");

module.exports = async (req, res) => {
  applySecurityHeaders(res);
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: { code: "METHOD_NOT_ALLOWED", message: "Only GET is supported." } }));
  }
  const { limited } = await enforceRateLimit(req, res, 20);
  if (limited) {
    res.statusCode = 429;
    return res.end(JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many requests." } }));
  }

  const url = new URL(req.url, "http://internal");
  const query = url.searchParams.get("q") || "";

  try {
    const results = await search.searchWeb(query);
    res.end(JSON.stringify({ results }));
  } catch (err) {
    res.statusCode = err.code === "SEARCH_NOT_CONFIGURED" ? 503 : 400;
    res.end(JSON.stringify({ error: { code: err.code || "SEARCH_ERROR", message: err.message } }));
  }
};
