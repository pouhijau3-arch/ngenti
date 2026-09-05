/**
 * POST /api/plugins/calculator
 * Body: { expression: "2 * (3 + 4)" }
 * Standalone endpoint for the Calculator plugin, independent of chat.
 */

const calculator = require("../../lib/calculator");
const { applySecurityHeaders } = require("../../lib/security");
const { enforceRateLimit } = require("../../lib/ratelimit");

module.exports = async (req, res) => {
  applySecurityHeaders(res);
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: { code: "METHOD_NOT_ALLOWED", message: "Only POST is supported." } }));
  }
  const { limited } = await enforceRateLimit(req, res, 60);
  if (limited) {
    res.statusCode = 429;
    return res.end(JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many requests." } }));
  }

  const body = req.body || {};
  try {
    const result = calculator.calculate(body.expression);
    res.end(JSON.stringify(result));
  } catch (err) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: { code: "CALCULATOR_ERROR", message: err.message } }));
  }
};
