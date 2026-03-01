import { LS_KEYS } from "../constants";

const RING_SIZE = 100;
const _ring: Array<{ level: string; msg: string; ts: number }> = [];
let _ringIdx = 0;
let _lastError: string | null = null;

function pushRing(level: string, msg: string): void {
  _ring[_ringIdx % RING_SIZE] = { level, msg, ts: Date.now() };
  _ringIdx++;
  if (level === "error") _lastError = msg;
}

export function getLogs(): Array<{ level: string; msg: string; ts: number }> {
  if (_ring.length < RING_SIZE) return [..._ring];
  const start = _ringIdx % RING_SIZE;
  return [..._ring.slice(start), ..._ring.slice(0, start)];
}

export function getLastError(): string | null {
  return _lastError;
}

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
  pushRing("log", args.map(String).join(" "));
  if (isLoggingEnabled()) console.log("[ListeningStats]", ...args);
}

export function warn(...args: any[]): void {
  pushRing("warn", args.map(String).join(" "));
  if (isLoggingEnabled()) console.warn("[ListeningStats]", ...args);
}

export function error(...args: any[]): void {
  pushRing("error", args.map(String).join(" "));
  if (isLoggingEnabled()) console.error("[ListeningStats]", ...args);
}
