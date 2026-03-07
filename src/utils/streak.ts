/**
 * Shared streak calculation utility.
 * Extracted from provider implementations to eliminate duplication.
 */

import { toLocalDateKey } from "./dateKey";

/**
 * Calculate the current consecutive listening streak in days.
 *
 * Walks backwards from today (day 0) up to 365 days.
 * Counts consecutive days that appear in activityDates.
 * Breaks on the first missing day (after day 0).
 *
 * @param activityDates - Array of local-timezone date strings (YYYY-MM-DD) representing days with activity
 * @returns Number of consecutive days in the current streak
 */
export function calculateStreak(activityDates: string[]): number {
  const dateSet = new Set(activityDates);
  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = toLocalDateKey(d);
    if (dateSet.has(key)) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }
  return streak;
}
