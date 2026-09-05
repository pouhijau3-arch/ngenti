/**
 * lib/github.js
 *
 * Real GitHub REST API integration (https://docs.github.com/en/rest).
 * The GitHub token NEVER leaves the server: the browser only ever
 * holds an opaque encrypted session id (see lib/session.js).
 *
 * All mutating calls (write/delete) require the correct current
 * blob `sha`, exactly like the GitHub Contents API demands, so we
 * never clobber concurrent changes.
 */

const API_BASE = "https://api.github.com";
const UA = "WEB-AI/1.0 (+github-integration)";

async function ghFetch(token, path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": UA,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const message = (body && body.message) || res.statusText;
    const err = new Error(`GitHub API error (${res.status}): ${message}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

/** GET /user - verifies a token is valid and returns the identity. */
async function verifyToken(token) {
  const user = await ghFetch(token, "/user");
  return { login: user.login, id: user.id, avatarUrl: user.avatar_url };
}

/** GET /user/repos - list repos the token can access. */
async function listRepos(token) {
  const repos = await ghFetch(token, "/user/repos?per_page=50&sort=updated");
  return repos.map((r) => ({
    fullName: r.full_name,
    private: r.private,
    defaultBranch: r.default_branch,
    permissions: r.permissions,
  }));
}

/** GET /repos/{owner}/{repo}/contents/{path} - file or directory listing. */
async function getContents(token, owner, repo, path = "", ref) {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  return ghFetch(token, `/repos/${owner}/${repo}/contents/${encodePath(path)}${q}`);
}

function encodePath(path) {
  return path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

/** PUT /repos/{owner}/{repo}/contents/{path} - create or update a file. */
async function writeFile(token, { owner, repo, path, content, message, sha, branch }) {
  const body = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch,
  };
  if (sha) body.sha = sha; // required when updating an existing file
  return ghFetch(token, `/repos/${owner}/${repo}/contents/${encodePath(path)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/** DELETE /repos/{owner}/{repo}/contents/{path} - delete a file, requires sha. */
async function deleteFile(token, { owner, repo, path, message, sha, branch }) {
  return ghFetch(token, `/repos/${owner}/${repo}/contents/${encodePath(path)}`, {
    method: "DELETE",
    body: JSON.stringify({ message, sha, branch }),
  });
}

module.exports = { verifyToken, listRepos, getContents, writeFile, deleteFile };
