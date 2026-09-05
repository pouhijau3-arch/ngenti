/**
 * POST /api/github/delete
 * Body: { owner, repo, path, message, sha, branch? }
 *
 * Same approval-gating rules as write.js: requires the current blob
 * `sha`, and only executes immediately if Auto Apply is enabled.
 */

const github = require("../../lib/github");
const sessionStore = require("../../lib/session");
const { withGithubSession, sendJson } = require("../../lib/github-endpoint-helper");

const REQUIRED = ["owner", "repo", "path", "message", "sha"];

module.exports = withGithubSession(
  async (req, res, ctx) => {
    const body = req.body || {};
    for (const field of REQUIRED) {
      if (typeof body[field] !== "string" || !body[field]) {
        return sendJson(res, 400, { error: { code: "VALIDATION_ERROR", message: `\`${field}\` is required.` } });
      }
    }

    const action = {
      type: "delete_file",
      owner: body.owner,
      repo: body.repo,
      path: body.path,
      message: body.message,
      sha: body.sha,
      branch: body.branch,
    };

    if (ctx.session.autoApply) {
      const result = await github.deleteFile(ctx.session.token, action);
      return sendJson(res, 200, { status: "applied", autoApply: true, result });
    }

    const approvalId = await sessionStore.createPendingApproval(ctx.sessionId, action);
    sendJson(res, 202, {
      status: "pending_approval",
      approvalId,
      message: "Review and confirm this deletion with POST /api/github/approve.",
    });
  },
  { methods: ["POST"], requireCsrf: true, limit: 15 }
);
