/**
 * lib/worldtime.js
 *
 * Real current time for any IANA timezone. This does not call an
 * external API and does not need a key: it uses Node's built-in
 * Intl/ICU timezone database, which is a real, authoritative source
 * for civil time (including DST rules) - not a fake or hardcoded
 * offset table.
 */

function getTimeInZone(timezone) {
  if (typeof timezone !== "string" || !timezone) {
    throw new Error("`timezone` must be a non-empty IANA timezone string, e.g. 'Asia/Jakarta'");
  }
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      dateStyle: "full",
      timeStyle: "long",
    });
  } catch {
    throw new Error(`Unknown IANA timezone: ${timezone}`);
  }
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "shortOffset",
  }).formatToParts(now);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));

  return {
    timezone,
    iso_like: `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}`,
    utc_offset: map.timeZoneName,
    formatted: formatter.format(now),
    epoch_ms: now.getTime(),
  };
}

module.exports = { getTimeInZone };
