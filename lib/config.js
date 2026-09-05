/**
 * lib/config.js
 *
 * Single source of truth for environment configuration.
 * Nothing here is a secret value - only booleans describing
 * whether a given provider is CONFIGURED (env vars present).
 *
 * This file must never log the actual values of secrets.
 */

function has(name) {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

const config = {
  xkiro: {
    baseURL: process.env.XKIRO_BASE_URL || "https://api.xkiro.com/v1",
    apiKey: process.env.XKIRO_API_KEY || "",
    defaultModel: process.env.XKIRO_DEFAULT_MODEL || "mistralai/mistral-small-2603",
    configured: has("XKIRO_API_KEY"),
  },
  search: {
    // Brave Search API - https://api.search.brave.com/app/documentation/web-search/get-started
    apiKey: process.env.SEARCH_API_KEY || "",
    configured: has("SEARCH_API_KEY"),
  },
  weather: {
    // OpenWeatherMap - https://openweathermap.org/current
    apiKey: process.env.WEATHER_API_KEY || "",
    configured: has("WEATHER_API_KEY"),
  },
  youtube: {
    // YouTube Data API v3 - https://developers.google.com/youtube/v3/docs/search/list
    apiKey: process.env.YOUTUBE_API_KEY || "",
    configured: has("YOUTUBE_API_KEY"),
  },
  github: {
    // GitHub REST API - https://docs.github.com/en/rest
    // This app uses a user-supplied Personal Access Token (fine-grained
    // PAT recommended) rather than a full OAuth App flow, so there is
    // no server-side client secret to configure - the user pastes a
    // token in the UI and it is verified against GET /user, then
    // encrypted and stored server-side (see lib/session.js).
    // Nothing to configure here; "configured" always true, the
    // per-user token is what determines whether GitHub is AVAILABLE.
    configured: true,
  },
  storage: {
    // Upstash Redis REST API - https://upstash.com/docs/redis/features/restapi
    url: process.env.UPSTASH_REDIS_REST_URL || "",
    token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
    configured: has("UPSTASH_REDIS_REST_URL") && has("UPSTASH_REDIS_REST_TOKEN"),
  },
  session: {
    // 32-byte hex/base64 key used to encrypt GitHub tokens at rest in storage.
    encryptionKey: process.env.SESSION_ENCRYPTION_KEY || "",
    configured: has("SESSION_ENCRYPTION_KEY"),
    cookieSecret: process.env.COOKIE_SECRET || "",
  },
  app: {
    env: process.env.NODE_ENV || "development",
    publicUrl: process.env.PUBLIC_APP_URL || "",
    maxToolIterations: 10,
  },
};

module.exports = config;
