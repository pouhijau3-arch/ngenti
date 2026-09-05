/**
 * GET /api/plugins/music?query=lofi+hip+hop
 *
 * Standalone endpoint for the Music Player plugin. Search uses the
 * real YouTube Data API v3 (requires YOUTUBE_API_KEY). Playback itself
 * happens client-side via the official YouTube IFrame Player API and
 * needs no key - see public/app.js.
 */

const youtube = require("../../lib/youtube");
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
  const query = url.searchParams.get("query") || "";

  try {
    const results = await youtube.searchVideos(query);
    res.end(JSON.stringify({ results }));
  } catch (err) {
    res.statusCode = err.code === "YOUTUBE_NOT_CONFIGURED" ? 503 : 400;
    res.end(JSON.stringify({ error: { code: err.code || "MUSIC_ERROR", message: err.message } }));
  }
};
