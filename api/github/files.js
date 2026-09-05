/**
 * GET /api/github/files?owner=...&repo=...&path=...&ref=...
 * Reads a file or directory listing (read-only, no approval needed).
 */

const github = require("../../lib/github");
const { withGithubSession, sendJson } = require("../../lib/github-endpoint-helper");

function parseQuery(req) {
  const url = new URL(req.url, "http://internal");
  return Object.fromEntries(url.searchParams.entries());
}

module.exports = withGithubSession(
  async (req, res, ctx) => {
    const { owner, repo, path = "", ref } = parseQuery(req);
    if (!owner || !repo) {
      return sendJson(res, 400, { error: { code: "VALIDATION_ERROR", message: "`owner` and `repo` are required." } });
    }
    const data = await github.getContents(ctx.session.token, owner, repo, path, ref);
    if (Array.isArray(data)) {
      return sendJson(res, 200, {
        type: "directory",
        entries: data.map((e) => ({ name: e.name, type: e.type, path: e.path, sha: e.sha })),
      });
    }
    const content =
      data.encoding === "base64" ? Buffer.from(data.content, "base64").toString("utf8") : data.content;
    sendJson(res, 200, { type: "file", path: data.path, sha: data.sha, content });
  },
  { methods: ["GET"], requireCsrf: false, limit: 30 }
);
