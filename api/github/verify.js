/**
 * POST /api/github/verify
 *
 * Body: { token: "<personal access token>" }
 *
 * Verifies the token against GitHub's real GET /user endpoint, then
 * stores it (encrypted) server-side and returns an opaque session id
 * to the browser as an httpOnly cookie. The raw token is never sent
 * back to the client and never logged.
 */

const github = require("../../lib/github");
const session = require("../../lib/session");
const storage = require("../../lib/storage");
const { applySecurityHeaders } = require("../../lib/security");
const { enforceRateLimit } = require("../../lib/ratelimit");

module.exports = async (req, res) => {
  applySecurityHeaders(res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: { code: "METHOD_NOT_ALLOWED", message: "Only POST is supported." } }));
  }

  const { limited } = await enforceRateLimit(req, res, 10);
  if (limited) {
    res.statusCode = 429;
    return res.end(JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many requests." } }));
  }

  if (!storage.isConfigured()) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        error: {
          code: "STORAGE_NOT_CONFIGURED",
          message: "Persistent storage is not configured, so GitHub sessions cannot be created safely.",
        },
      })
    );
  }

  const body = req.body || {};
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "`token` is required." } }));
  }

  let identity;
  try {
    identity = await github.verifyToken(token);
  } catch (err) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({ error: { code: "GITHUB_AUTH_FAILED", message: "Could not verify this token with GitHub." } })
    );
  }

  const sessionId = await session.createGithubSession({ token, login: identity.login, autoApply: false });
  const csrfToken = require("crypto").randomBytes(32).toString("hex");

  res.setHeader("Set-Cookie", [
    `gh_session=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=14400`,
    `csrf_token=${csrfToken}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=14400`,
  ]);

  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ login: identity.login, avatarUrl: identity.avatarUrl }));
};
