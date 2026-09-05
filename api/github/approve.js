/**
 * POST /api/github/approve
 * Body: { approvalId }
 *
 * Consumes a pending approval (one-time use, bound to this session)
 * and executes the underlying write or delete against the real
 * GitHub API. Also supports toggling Auto Apply on/off explicitly:
 *
 * POST /api/github/approve  Body: { setAutoApply: true|false }
 */

const github = require("../../lib/github");
const sessionStore = require("../../lib/session");
const { withGithubSession, sendJson } = require("../../lib/github-endpoint-helper");

module.exports = withGithubSession(
  async (req, res, ctx) => {
    const body = req.body || {};

    if (typeof body.setAutoApply === "boolean") {
      // Explicit, session-bound, user-initiated toggle only - the AI
      // itself has no path to flip this flag (see lib/tools.js).
      await sessionStore.setAutoApply(ctx.sessionId, body.setAutoApply);
      return sendJson(res, 200, { autoApply: body.setAutoApply });
    }

    const approvalId = typeof body.approvalId === "string" ? body.approvalId : "";
    if (!approvalId) {
      return sendJson(res, 400, { error: { code: "VALIDATION_ERROR", message: "`approvalId` is required." } });
    }

    let action;
    try {
      action = await sessionStore.consumePendingApproval(approvalId, ctx.sessionId);
    } catch (err) {
      return sendJson(res, 404, { error: { code: "APPROVAL_INVALID", message: err.message } });
    }

    const result =
      action.type === "write_file"
        ? await github.writeFile(ctx.session.token, action)
        : await github.deleteFile(ctx.session.token, action);

    sendJson(res, 200, { status: "applied", action: action.type, result });
  },
  { methods: ["POST"], requireCsrf: true, limit: 15 }
);

async function sessionRaw(sessionId) {
  const storage = require("../../lib/storage");
  return storage.getJSON(`ghsession:${sessionId}`);
}
