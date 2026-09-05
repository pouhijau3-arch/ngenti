/**
 * lib/youtube.js
 *
 * Real YouTube integration:
 *   - Search uses the YouTube Data API v3 `search.list` endpoint.
 *     Docs: https://developers.google.com/youtube/v3/docs/search/list
 *     Requires YOUTUBE_API_KEY.
 *   - Playback uses the official YouTube IFrame Player API on the
 *     frontend (public/app.js), which needs no API key at all.
 *
 * If YOUTUBE_API_KEY is not configured, search is disabled gracefully
 * (clear error) but playback of a known video ID still works, since
 * playback does not require the Data API.
 */

const config = require("./config");
const { assertSafeOutboundUrl } = require("./security");

class YoutubeNotConfiguredError extends Error {
  constructor() {
    super("YOUTUBE_API_KEY is not configured. Set it in your environment (see .env.example).");
    this.code = "YOUTUBE_NOT_CONFIGURED";
  }
}

async function searchVideos(query) {
  if (!config.youtube.configured) throw new YoutubeNotConfiguredError();
  if (typeof query !== "string" || !query.trim()) {
    throw new Error("`query` must be a non-empty string");
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", query);
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "5");
  url.searchParams.set("key", config.youtube.apiKey);

  assertSafeOutboundUrl(url.toString());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let res;
  try {
    res = await fetch(url.toString(), { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`YouTube Data API request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  return (data.items || []).map((item) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    channel: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails && item.snippet.thumbnails.default
      ? item.snippet.thumbnails.default.url
      : null,
  }));
}

module.exports = { searchVideos, YoutubeNotConfiguredError };
