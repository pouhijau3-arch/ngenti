/**
 * POST /api/github/disconnect
 * Destroys the server-side GitHub session and clears the cookie.
 */

const sessionStore = require("../../lib/session");
const { withGithubSession, sendJson } = require("../../lib/github-endpoint-helper");

module.exports = withGithubSession(
  async (req, res, ctx) => {
    await sessionStore.destroyGithubSession(ctx.sessionId);
    res.setHeader("Set-Cookie", [
      "gh_session=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0",
    ]);
    sendJson(res, 200, { disconnected: true });
  },
  { methods: ["POST"], requireCsrf: true, limit: 10 }
);
