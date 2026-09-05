/**
 * lib/validation.js
 *
 * Server-side validation for every request body. The frontend is
 * never trusted as a security boundary - all of this is re-checked
 * here regardless of what the client sends.
 */

const MAX_BODY_BYTES = 200 * 1024; // 200 KB
const MAX_MESSAGES = 100;
const MAX_MESSAGE_CHARS = 24000;
const VALID_ROLES = new Set(["system", "user", "assistant", "tool"]);
const KNOWN_PLUGINS = [
  "web_search",
  "music",
  "youtube",
  "weather",
  "calculator",
  "world_time",
  "github",
];

class ValidationError extends Error {
  constructor(message, code = "VALIDATION_ERROR") {
    super(message);
    this.code = code;
  }
}

function assertBodySize(rawBody) {
  const size = Buffer.byteLength(rawBody || "", "utf8");
  if (size > MAX_BODY_BYTES) {
    throw new ValidationError("Request body too large", "BODY_TOO_LARGE");
  }
}

function assertContentType(req) {
  const ct = (req.headers["content-type"] || "").split(";")[0].trim();
  if (ct !== "application/json") {
    throw new ValidationError("Content-Type must be application/json", "BAD_CONTENT_TYPE");
  }
}

function validateChatRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("Request body must be a JSON object");
  }
  const { model, messages, plugins, webSearch } = body;

  if (typeof model !== "string" || model.length < 1 || model.length > 200) {
    throw new ValidationError("`model` must be a non-empty string");
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ValidationError("`messages` must be a non-empty array");
  }
  if (messages.length > MAX_MESSAGES) {
    throw new ValidationError(`Too many messages (max ${MAX_MESSAGES})`);
  }
  for (const m of messages) {
    if (!m || typeof m !== "object") throw new ValidationError("Each message must be an object");
    if (!VALID_ROLES.has(m.role)) throw new ValidationError(`Invalid message role: ${m.role}`);
    if (typeof m.content !== "string" && !Array.isArray(m.content)) {
      throw new ValidationError("Message `content` must be a string or content-block array");
    }
    const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    if (text.length > MAX_MESSAGE_CHARS) {
      throw new ValidationError("Message content too long");
    }
  }

  const safePlugins = {};
  if (plugins !== undefined) {
    if (typeof plugins !== "object" || plugins === null || Array.isArray(plugins)) {
      throw new ValidationError("`plugins` must be an object");
    }
    for (const key of Object.keys(plugins)) {
      if (!KNOWN_PLUGINS.includes(key)) continue; // silently ignore unknown keys
      safePlugins[key] = Boolean(plugins[key]);
    }
  }

  if (webSearch !== undefined && typeof webSearch !== "boolean") {
    throw new ValidationError("`webSearch` must be a boolean");
  }

  return {
    model,
    messages,
    plugins: safePlugins,
    webSearch: Boolean(webSearch),
  };
}

function validateToolArguments(schema, args) {
  if (!schema || schema.type !== "object") return args;
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    throw new ValidationError("Tool arguments must be an object");
  }
  const props = schema.properties || {};
  const required = schema.required || [];
  for (const key of required) {
    if (!(key in args)) throw new ValidationError(`Missing required argument: ${key}`);
  }
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(args)) {
      if (!(key in props)) throw new ValidationError(`Unknown argument: ${key}`);
    }
  }
  for (const [key, val] of Object.entries(args)) {
    const propSchema = props[key];
    if (!propSchema) continue;
    if (propSchema.type === "string" && typeof val !== "string") {
      throw new ValidationError(`Argument ${key} must be a string`);
    }
    if (propSchema.type === "number" && typeof val !== "number") {
      throw new ValidationError(`Argument ${key} must be a number`);
    }
    if (propSchema.type === "boolean" && typeof val !== "boolean") {
      throw new ValidationError(`Argument ${key} must be a boolean`);
    }
  }
  return args;
}

module.exports = {
  ValidationError,
  MAX_BODY_BYTES,
  KNOWN_PLUGINS,
  assertBodySize,
  assertContentType,
  validateChatRequest,
  validateToolArguments,
};
