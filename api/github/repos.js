/**
 * GET /api/github/repos
 * Lists repositories accessible to the connected GitHub session.
 */

const github = require("../../lib/github");
const { withGithubSession, sendJson } = require("../../lib/github-endpoint-helper");

module.exports = withGithubSession(
  async (req, res, ctx) => {
    const repos = await github.listRepos(ctx.session.token);
    sendJson(res, 200, { repos });
  },
  { methods: ["GET"], requireCsrf: false, limit: 30 }
);
