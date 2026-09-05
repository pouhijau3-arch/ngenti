/**
 * lib/session.js
 *
 * GitHub sessions and pending write/delete approvals, stored in
 * Upstash Redis (see lib/storage.js) - never in an in-memory Map,
 * so they survive across serverless function invocations.
 *
 * The raw GitHub token is encrypted at rest (AES-256-GCM, see
 * lib/security.js) using SESSION_ENCRYPTION_KEY. It is decrypted
 * only in-process, only for the duration of a single GitHub API
 * call, and is never sent back to the browser.
 */

const crypto = require("crypto");
const storage = require("./storage");
const { encryptSecret, decryptSecret } = require("./security");

const SESSION_TTL_SECONDS = 60 * 60 * 4; // 4 hours
const APPROVAL_TTL_SECONDS = 60 * 10; // 10 minutes, one-time use

function newId() {
  return crypto.randomBytes(24).toString("hex");
}

// ---------------------------------------------------------------------------
// GitHub sessions
// ---------------------------------------------------------------------------
async function createGithubSession({ token, login, autoApply }) {
  const sessionId = newId();
  const record = {
    encryptedToken: encryptSecret(token),
    login,
    autoApply: Boolean(autoApply),
    createdAt: Date.now(),
  };
  await storage.setJSON(`ghsession:${sessionId}`, record, SESSION_TTL_SECONDS);
  return sessionId;
}

async function getGithubSession(sessionId) {
  if (!sessionId) return null;
  const record = await storage.getJSON(`ghsession:${sessionId}`);
  if (!record) return null;
  return {
    login: record.login,
    autoApply: record.autoApply,
    token: decryptSecret(record.encryptedToken),
  };
}

async function destroyGithubSession(sessionId) {
  if (!sessionId) return;
  await storage.del(`ghsession:${sessionId}`);
}

/** Explicit, user-initiated Auto Apply toggle. Never called by the AI. */
async function setAutoApply(sessionId, autoApply) {
  const record = await storage.getJSON(`ghsession:${sessionId}`);
  if (!record) throw new Error("Session not found or expired");
  record.autoApply = Boolean(autoApply);
  await storage.setJSON(`ghsession:${sessionId}`, record, SESSION_TTL_SECONDS);
}

// ---------------------------------------------------------------------------
// Pending GitHub mutation approvals (one-time, session-bound)
// ---------------------------------------------------------------------------
async function createPendingApproval(sessionId, action) {
  const approvalId = newId();
  await storage.setJSON(
    `ghapproval:${approvalId}`,
    { sessionId, action, createdAt: Date.now(), used: false },
    APPROVAL_TTL_SECONDS
  );
  return approvalId;
}

async function consumePendingApproval(approvalId, sessionId) {
  const record = await storage.getJSON(`ghapproval:${approvalId}`);
  if (!record) throw new Error("Approval not found or expired");
  if (record.used) throw new Error("Approval has already been used");
  if (record.sessionId !== sessionId) throw new Error("Approval does not belong to this session");
  await storage.del(`ghapproval:${approvalId}`); // one-time use: delete immediately
  return record.action;
}

module.exports = {
  createGithubSession,
  getGithubSession,
  destroyGithubSession,
  setAutoApply,
  createPendingApproval,
  consumePendingApproval,
};
