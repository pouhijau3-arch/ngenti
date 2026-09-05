/**
 * POST /api/github/write
 * Body: { owner, repo, path, content, message, sha?, branch? }
 *
 * Creates or updates a file. Unless the session has Auto Apply enabled,
 * this only records a pending, one-time, session-bound approval and
 * returns its id - the actual GitHub write happens only after the user
 * confirms via POST /api/github/approve.
 */

const github = require("../../lib/github");
const sessionStore = require("../../lib/session");
const { withGithubSession, sendJson } = require("../../lib/github-endpoint-helper");

const REQUIRED = ["owner", "repo", "path", "content", "message"];

module.exports = withGithubSession(
  async (req, res, ctx) => {
    const body = req.body || {};
    for (const field of REQUIRED) {
      if (typeof body[field] !== "string" || !body[field]) {
        return sendJson(res, 400, { error: { code: "VALIDATION_ERROR", message: `\`${field}\` is required.` } });
      }
    }
    if (body.content.length > 500000) {
      return sendJson(res, 400, { error: { code: "VALIDATION_ERROR", message: "File content too large (max 500KB)." } });
    }

    const action = {
      type: "write_file",
      owner: body.owner,
      repo: body.repo,
      path: body.path,
      content: body.content,
      message: body.message,
      sha: body.sha,
      branch: body.branch,
    };

    if (ctx.session.autoApply) {
      const result = await github.writeFile(ctx.session.token, action);
      return sendJson(res, 200, { status: "applied", autoApply: true, result });
    }

    const approvalId = await sessionStore.createPendingApproval(ctx.sessionId, action);
    sendJson(res, 202, {
      status: "pending_approval",
      approvalId,
      message: "Review and confirm this change with POST /api/github/approve.",
    });
  },
  { methods: ["POST"], requireCsrf: true, limit: 15 }
);
