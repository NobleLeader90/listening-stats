/**
 * Centralized localStorage key strings and custom event names.
 * All `listening-stats:*` keys must be defined here, never hardcoded inline.
 */

export const LS_KEYS = {
  /** Prefix used for dynamic key construction (e.g. rateLimitedUntil) */
  STORAGE_PREFIX: "listening-stats:",

  // Provider & tracking
  PROVIDER: "listening-stats:provider",
  POLLING_DATA: "listening-stats:pollingData",
  PLAY_THRESHOLD: "listening-stats:playThreshold",
  TRACKING_PAUSED: "listening-stats:tracking-paused",
  SKIP_REPEATS: "listening-stats:skip-repeats",
  LAST_UPDATE: "listening-stats:lastUpdate",

  // Logging
  LOGGING: "listening-stats:logging",

  // User preferences
  PREFERENCES: "listening-stats:preferences",

  // External provider configs
  LASTFM_CONFIG: "listening-stats:lastfm",
  STATSFM_CONFIG: "listening-stats:statsfm",

  // Updater
  LAST_UPDATE_CHECK: "listening-stats:lastUpdateCheck",

  // API cache
  SEARCH_CACHE: "listening-stats:searchCache",

  // One-time migration flags
  DEDUP_V2_DONE: "listening-stats:dedup-v2-done",
  MIGRATION_BACKUP: "listening-stats:migration-backup",
  MIGRATION_VERSION: "listening-stats:migration-version",

  // UI state
  SFM_PROMO_DISMISSED: "listening-stats:sfm-promo-dismissed",
  TOUR_SEEN: "listening-stats:tour-seen",
  TOUR_VERSION: "listening-stats:tour-version",
  CARD_ORDER: "listening-stats:card-order",
  PERIOD: "listening-stats:period",
} as const;

/**
 * Custom event names dispatched via window.dispatchEvent / window.addEventListener.
 */
export const EVENTS = {
  STATS_UPDATED: "listening-stats:updated",
  PREFS_CHANGED: "listening-stats:prefs-changed",
  RESET_LAYOUT: "listening-stats:reset-layout",
  START_TOUR: "listening-stats:start-tour",
} as const;

/**
 * Remove all known listening-stats localStorage keys.
 * Used by "Wipe Everything" in SettingsPanel.
 * Skips STORAGE_PREFIX (not a real key).
 */
export function clearAllLocalStorage(): void {
  try {
    for (const [name, key] of Object.entries(LS_KEYS)) {
      if (name === "STORAGE_PREFIX") continue;
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}
