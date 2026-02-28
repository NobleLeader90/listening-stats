import { LS_KEYS } from "../constants";

export function isLoggingEnabled(): boolean {
  try {
    return localStorage.getItem(LS_KEYS.LOGGING) === "1";
  } catch (e) {
    console.warn("[listening-stats] Logger config access failed", e);
    return false;
  }
}

export function setLoggingEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(LS_KEYS.LOGGING, "1");
    else localStorage.removeItem(LS_KEYS.LOGGING);
  } catch (e) {
    console.warn("[listening-stats] Logger config access failed", e);
  }
}

export function log(...args: any[]): void {
  if (isLoggingEnabled()) console.log("[ListeningStats]", ...args);
}

export function warn(...args: any[]): void {
  if (isLoggingEnabled()) console.warn("[ListeningStats]", ...args);
}

export function error(...args: any[]): void {
  if (isLoggingEnabled()) console.error("[ListeningStats]", ...args);
}
