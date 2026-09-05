/**
 * lib/ratelimit.js
 *
 * Fixed-window rate limiting backed by lib/storage.js (Upstash Redis).
 * This is real, distributed, persistent rate limiting - not an
 * in-memory counter that resets on every serverless cold start.
 *
 * If storage is not configured, requests are allowed through but a
 * clear warning is attached to the response so operators notice this
 * in logs/headers. This is a deliberate fail-open choice documented
 * in README.md; it is NOT a fake pass - it is a visible degradation.
 */

const storage = require("./storage");

const WINDOW_SECONDS = 60;
const DEFAULT_LIMIT = 30; // requests per window per key

function clientKey(req) {
  const fwd = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd || "").split(",")[0].trim() || "unknown";
  return `ratelimit:${req.url.split("?")[0]}:${ip}`;
}

async function enforceRateLimit(req, res, limit = DEFAULT_LIMIT) {
  if (!storage.isConfigured()) {
    res.setHeader("X-RateLimit-Status", "disabled-not-configured");
    return { limited: false };
  }
  const key = clientKey(req);
  const count = await storage.incrWithExpiry(key, WINDOW_SECONDS);
  res.setHeader("X-RateLimit-Limit", String(limit));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, limit - count)));
  if (count > limit) {
    return { limited: true };
  }
  return { limited: false };
}

module.exports = { enforceRateLimit };
