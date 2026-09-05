/**
 * lib/github-endpoint-helper.js
 *
 * Shared boilerplate for /api/github/* endpoints: session lookup,
 * CSRF verification for mutating requests, and consistent error JSON.
 */

const { applySecurityHeaders, parseCookies, verifyCsrf } = require("./security");
const session = require("./session");
const { enforceRateLimit } = require("./ratelimit");

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

/**
 * Wraps a handler with: security headers, method check, rate limit,
 * GitHub session resolution, and (for mutating methods) CSRF check.
 */
function withGithubSession(handler, { methods = ["GET"], requireCsrf = false, limit = 20 } = {}) {
  return async (req, res) => {
    applySecurityHeaders(res);

    if (!methods.includes(req.method)) {
      res.setHeader("Allow", methods.join(", "));
      return sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: `Use ${methods.join(", ")}.` } });
    }

    const { limited } = await enforceRateLimit(req, res, limit);
    if (limited) return sendJson(res, 429, { error: { code: "RATE_LIMITED", message: "Too many requests." } });

    if (requireCsrf && !verifyCsrf(req)) {
      return sendJson(res, 403, { error: { code: "CSRF_FAILED", message: "Missing or invalid CSRF token." } });
    }

    const cookies = parseCookies(req);
    const ghSession = await session.getGithubSession(cookies["gh_session"]);
    if (!ghSession) {
      return sendJson(res, 401, { error: { code: "GITHUB_NOT_CONNECTED", message: "Connect GitHub first." } });
    }

    try {
      await handler(req, res, { session: ghSession, sessionId: cookies["gh_session"] });
    } catch (err) {
      sendJson(res, err.status && err.status < 500 ? err.status : 502, {
        error: { code: "GITHUB_ERROR", message: err.message || "GitHub request failed." },
      });
    }
  };
}

module.exports = { withGithubSession, sendJson };
