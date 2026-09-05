/**
 * lib/security.js
 *
 * Cross-cutting security helpers used by every API route:
 *  - security headers
 *  - CSRF double-submit token verification
 *  - SSRF-safe host checking (defense in depth; this app does not
 *    perform arbitrary user-supplied URL fetches, but this guard
 *    is applied to the small number of outbound calls we do make
 *    so a future change cannot silently introduce SSRF).
 *  - AES-256-GCM encryption for tokens at rest (GitHub sessions).
 */

const crypto = require("crypto");
const config = require("./config");

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------
function applySecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' https: data:",
      "connect-src 'self'",
      "frame-src https://www.youtube-nocookie.com",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );
  if (config.app.env === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
}

// ---------------------------------------------------------------------------
// CSRF (double-submit cookie pattern)
// ---------------------------------------------------------------------------
function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function issueCsrfToken(res) {
  const token = crypto.randomBytes(32).toString("hex");
  res.setHeader(
    "Set-Cookie",
    `csrf_token=${token}; Path=/; HttpOnly; SameSite=Strict; Secure`
  );
  return token;
}

function verifyCsrf(req) {
  const cookies = parseCookies(req);
  const cookieToken = cookies["csrf_token"];
  const headerToken = req.headers["x-csrf-token"];
  if (!cookieToken || !headerToken) return false;
  const a = Buffer.from(String(cookieToken));
  const b = Buffer.from(String(headerToken));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// SSRF guard - blocks localhost, private ranges, link-local, and the cloud
// metadata address for any outbound fetch this app performs.
// ---------------------------------------------------------------------------
const BLOCKED_HOSTS = new Set(["localhost", "0.0.0.0", "169.254.169.254", "metadata.google.internal"]);

function isPrivateIPv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function assertSafeOutboundUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are allowed");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname)) {
    throw new Error("Blocked host");
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) && isPrivateIPv4(hostname)) {
    throw new Error("Blocked private IP range");
  }
  if (hostname === "::1" || hostname.startsWith("fe80:") || hostname.startsWith("fc") || hostname.startsWith("fd")) {
    throw new Error("Blocked private IPv6 range");
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Token encryption at rest (AES-256-GCM)
// ---------------------------------------------------------------------------
function getEncryptionKey() {
  if (!config.session.configured) {
    throw new Error("SESSION_ENCRYPTION_KEY is not configured");
  }
  const raw = config.session.encryptionKey;
  // Accept either a 64-char hex string or a base64 string that decodes to 32 bytes.
  let key;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }
  if (key.length !== 32) {
    throw new Error("SESSION_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return key;
}

function encryptSecret(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decryptSecret(payload) {
  const key = getEncryptionKey();
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

module.exports = {
  applySecurityHeaders,
  parseCookies,
  issueCsrfToken,
  verifyCsrf,
  assertSafeOutboundUrl,
  encryptSecret,
  decryptSecret,
};
