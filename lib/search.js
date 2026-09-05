/**
 * lib/search.js
 *
 * Real web search using the Brave Search API.
 * Docs: https://api.search.brave.com/app/documentation/web-search/get-started
 *
 * Requires SEARCH_API_KEY. If not configured, callers must show a
 * clear configuration error - never fabricated results.
 *
 * All results returned to the model are treated as UNTRUSTED DATA by
 * the chat orchestrator (see api/chat.js) - the model is instructed
 * never to follow instructions embedded in snippets/titles/URLs.
 */

const config = require("./config");
const { assertSafeOutboundUrl } = require("./security");

const MAX_RESULTS = 5;
const MAX_SNIPPET_CHARS = 400;

class SearchNotConfiguredError extends Error {
  constructor() {
    super("SEARCH_API_KEY is not configured. Set it in your environment (see .env.example).");
    this.code = "SEARCH_NOT_CONFIGURED";
  }
}

function isValidHttpUrl(u) {
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

async function searchWeb(query) {
  if (!config.search.configured) throw new SearchNotConfiguredError();
  if (typeof query !== "string" || !query.trim()) {
    throw new Error("`query` must be a non-empty string");
  }
  if (query.length > 400) {
    throw new Error("Query too long");
  }

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(MAX_RESULTS));

  assertSafeOutboundUrl(url.toString());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let res;
  try {
    res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": config.search.apiKey,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Brave Search request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const rawResults = (data.web && data.web.results) || [];

  return rawResults
    .filter((r) => isValidHttpUrl(r.url))
    .slice(0, MAX_RESULTS)
    .map((r) => ({
      title: String(r.title || "").slice(0, 200),
      url: r.url,
      snippet: String(r.description || "").replace(/<[^>]*>/g, "").slice(0, MAX_SNIPPET_CHARS),
      source: "brave_search",
    }));
}

module.exports = { searchWeb, SearchNotConfiguredError, MAX_RESULTS };
