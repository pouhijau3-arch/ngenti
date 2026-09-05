/**
 * lib/weather.js
 *
 * Real weather data from OpenWeatherMap's Current Weather Data API.
 * Docs: https://openweathermap.org/current
 *
 * Requires WEATHER_API_KEY. If not configured, callers must show a
 * clear configuration error - never a fabricated forecast.
 */

const config = require("./config");
const { assertSafeOutboundUrl } = require("./security");

class WeatherNotConfiguredError extends Error {
  constructor() {
    super("WEATHER_API_KEY is not configured. Set it in your environment (see .env.example).");
    this.code = "WEATHER_NOT_CONFIGURED";
  }
}

async function getWeather(location) {
  if (!config.weather.configured) throw new WeatherNotConfiguredError();
  if (typeof location !== "string" || !location.trim()) {
    throw new Error("`location` must be a non-empty string, e.g. 'Jakarta, ID'");
  }

  const url = new URL("https://api.openweathermap.org/data/2.5/weather");
  url.searchParams.set("q", location);
  url.searchParams.set("appid", config.weather.apiKey);
  url.searchParams.set("units", "metric");

  assertSafeOutboundUrl(url.toString());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let res;
  try {
    res = await fetch(url.toString(), { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 404) {
    throw new Error(`Location not found: ${location}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenWeatherMap request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  return {
    location: `${data.name}, ${data.sys && data.sys.country ? data.sys.country : ""}`.trim(),
    description: data.weather && data.weather[0] ? data.weather[0].description : "unknown",
    temperature_c: data.main ? data.main.temp : null,
    feels_like_c: data.main ? data.main.feels_like : null,
    humidity_pct: data.main ? data.main.humidity : null,
    wind_speed_ms: data.wind ? data.wind.speed : null,
    provider: "openweathermap",
  };
}

module.exports = { getWeather, WeatherNotConfiguredError };
