/**
 * Shared date key utility for producing YYYY-MM-DD strings in the user's local timezone.
 *
 * The 'en-CA' locale produces ISO 8601 date format (YYYY-MM-DD) using the local
 * timezone, unlike `toISOString()` which always uses UTC. This is safe in
 * Spicetify's Chromium environment where 'en-CA' is always available.
 *
 * Use this instead of `toISOString().split("T")[0]` whenever you need a date
 * key for grouping plays by calendar day, so that plays near midnight are
 * attributed to the correct local calendar day.
 */

/**
 * Convert a timestamp or Date to a YYYY-MM-DD string in the user's local timezone.
 *
 * @param tsOrDate - Unix timestamp in milliseconds, or a Date object
 * @returns ISO 8601 date string (YYYY-MM-DD) in the local timezone
 */
export function toLocalDateKey(tsOrDate: number | Date): string {
  const d = typeof tsOrDate === "number" ? new Date(tsOrDate) : tsOrDate;
  return d.toLocaleDateString("en-CA");
}
