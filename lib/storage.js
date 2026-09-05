/**
 * lib/storage.js
 *
 * Persistent, serverless-compatible storage using the Upstash Redis
 * REST API (https://upstash.com/docs/redis/features/restapi).
 *
 * This is used for:
 *   - encrypted GitHub sessions (short-lived, TTL-bound)
 *   - pending GitHub write/delete approvals (one-time, TTL-bound)
 *   - distributed rate limiting counters
 *
 * IMPORTANT: this module NEVER falls back to an in-memory Map. If
 * Upstash is not configured, callers receive a clear "NOT CONFIGURED"
 * error instead of silently degrading to fake/non-persistent state.
 */

const config = require("./config");

class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      "Persistent storage is not configured. Set UPSTASH_REDIS_REST_URL and " +
        "UPSTASH_REDIS_REST_TOKEN (see .env.example)."
    );
    this.code = "STORAGE_NOT_CONFIGURED";
  }
}

function requireConfigured() {
  if (!config.storage.configured) throw new StorageNotConfiguredError();
}

async function redisCommand(args) {
  requireConfigured();
  const res = await fetch(`${config.storage.url}/${args.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${config.storage.token}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) {
    throw new Error(`Storage command failed: ${body && body.error ? body.error : res.status}`);
  }
  return body.result;
}

/** Set a JSON-serializable value with a TTL in seconds. */
async function setJSON(key, value, ttlSeconds) {
  const payload = JSON.stringify(value);
  if (ttlSeconds) {
    return redisCommand(["SET", key, payload, "EX", String(ttlSeconds)]);
  }
  return redisCommand(["SET", key, payload]);
}

async function getJSON(key) {
  const result = await redisCommand(["GET", key]);
  if (result === null || result === undefined) return null;
  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}

async function del(key) {
  return redisCommand(["DEL", key]);
}

/** Atomic increment with expiry, used for rate limiting windows. */
async function incrWithExpiry(key, ttlSeconds) {
  const count = await redisCommand(["INCR", key]);
  if (Number(count) === 1) {
    await redisCommand(["EXPIRE", key, String(ttlSeconds)]);
  }
  return Number(count);
}

module.exports = {
  StorageNotConfiguredError,
  isConfigured: () => config.storage.configured,
  setJSON,
  getJSON,
  del,
  incrWithExpiry,
};
