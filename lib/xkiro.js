/**
 * lib/xkiro.js
 *
 * Real integration with the xKiro AI gateway.
 *
 * VERIFIED against https://docs.xkiro.com/ (see docs/xkiro-api.md for the
 * verification notes and date):
 *   - Base URL: https://api.xkiro.com/v1
 *   - Auth: `Authorization: Bearer <key>` (or `x-api-key`)
 *   - xKiro speaks the OpenAI Chat Completions wire format at
 *     POST /v1/chat/completions (also speaks Anthropic Messages at
 *     POST /v1/messages, which this app does not use).
 *   - GET /v1/models is public and lists live available models
 *     (vendor/model id format, e.g. "openai/gpt-5.6-sol").
 *   - Streaming is Server-Sent Events, OpenAI-style `data: {...}` chunks
 *     terminated by `data: [DONE]`.
 *   - Function/tool calling follows the OpenAI `tools` / `tool_calls`
 *     contract ("describe your functions and let the model decide when
 *     to call them").
 *
 * Because the wire format is OpenAI-compatible, we use the official
 * `openai` SDK pointed at xKiro's base URL, exactly as instructed by
 * the project spec and confirmed by xKiro's own docs ("point the SDK
 * you already use at xKiro, change the model ID").
 */

const OpenAI = require("openai");
const config = require("./config");

class XkiroNotConfiguredError extends Error {
  constructor() {
    super("XKIRO_API_KEY is not configured. Set it in your environment (see .env.example).");
    this.code = "XKIRO_NOT_CONFIGURED";
  }
}

function getClient() {
  if (!config.xkiro.configured) throw new XkiroNotConfiguredError();
  return new OpenAI({
    apiKey: config.xkiro.apiKey,
    baseURL: config.xkiro.baseURL,
  });
}

/** GET /v1/models - real, live model catalog. Never hardcoded. */
async function listModels() {
  // The models endpoint is documented as public, but we still send the
  // key when we have one since some deployments may require it.
  const headers = config.xkiro.apiKey ? { Authorization: `Bearer ${config.xkiro.apiKey}` } : {};
  const res = await fetch(`${config.xkiro.baseURL}/models`, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`xKiro /models request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const body = await res.json();
  return Array.isArray(body.data) ? body.data : [];
}

/**
 * Streaming chat completion. Returns an async iterator of raw OpenAI-style
 * stream chunks (delta content and/or tool_calls), matching the openai SDK.
 */
async function streamChatCompletion({ model, messages, tools }) {
  const client = getClient();
  return client.chat.completions.create({
    model,
    messages,
    tools: tools && tools.length ? tools : undefined,
    tool_choice: tools && tools.length ? "auto" : undefined,
    stream: true,
  });
}

/** Non-streaming chat completion, used as a fallback if streaming fails. */
async function createChatCompletion({ model, messages, tools }) {
  const client = getClient();
  return client.chat.completions.create({
    model,
    messages,
    tools: tools && tools.length ? tools : undefined,
    tool_choice: tools && tools.length ? "auto" : undefined,
    stream: false,
  });
}

module.exports = {
  XkiroNotConfiguredError,
  listModels,
  streamChatCompletion,
  createChatCompletion,
};
