import { LS_KEYS, EVENTS } from "../constants";

export interface UserPreferences {
  use24HourTime: boolean;
  itemsPerSection: number;
  genresPerSection: number;
  hiddenSections: string[];
}

const DEFAULTS: UserPreferences = {
  use24HourTime: false,
  itemsPerSection: 5,
  genresPerSection: 5,
  hiddenSections: [],
};

let cached: UserPreferences | null = null;

export function getPreferences(): UserPreferences {
  if (cached) return cached;
  try {
    const stored = localStorage.getItem(LS_KEYS.PREFERENCES);
    if (stored) {
      cached = { ...DEFAULTS, ...JSON.parse(stored) };
      return cached!;
    }
  } catch (e) {
    console.warn("[listening-stats] Preferences read failed", e);
  }
  cached = { ...DEFAULTS };
  return cached;
}

export function setPreference<K extends keyof UserPreferences>(
  key: K,
  value: UserPreferences[K],
): void {
  const prefs = getPreferences();
  prefs[key] = value;
  cached = prefs;
  try {
    localStorage.setItem(LS_KEYS.PREFERENCES, JSON.stringify(prefs));
  } catch (e) {
    console.warn("[listening-stats] Preferences write failed", e);
  }
  window.dispatchEvent(
    new CustomEvent(EVENTS.PREFS_CHANGED, { detail: { key, value } }),
  );
}

export function onPreferencesChanged(
  callback: (key: string, value: any) => void,
): () => void {
  const handler = (e: Event) => {
    const { key, value } = (e as CustomEvent).detail;
    callback(key, value);
  };
  window.addEventListener(EVENTS.PREFS_CHANGED, handler);
  return () => window.removeEventListener(EVENTS.PREFS_CHANGED, handler);
}
