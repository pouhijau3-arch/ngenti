/**
 * GET /api/models
 *
 * Returns the live model catalog from xKiro's public GET /v1/models
 * endpoint. This list is never hardcoded in source (see README's
 * anti-fake-implementation notes).
 */

const config = require("../lib/config");
const xkiro = require("../lib/xkiro");
const { applySecurityHeaders } = require("../lib/security");
const { enforceRateLimit } = require("../lib/ratelimit");

module.exports = async (req, res) => {
  applySecurityHeaders(res);

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

  if (!config.xkiro.configured) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        error: {
          code: "XKIRO_NOT_CONFIGURED",
          message: "XKIRO_API_KEY is not configured on the server.",
        },
      })
    );
  }

  try {
    const models = await xkiro.listModels();
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.end(JSON.stringify({ models, defaultModel: config.xkiro.defaultModel }));
  } catch (err) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: { code: "XKIRO_ERROR", message: err.message } }));
  }
};
