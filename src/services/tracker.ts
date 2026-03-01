import { EVENTS, LS_KEYS } from "../constants";
import { PlayEvent, PollingData, ProviderType } from "../types/listeningstats";
import { log, warn } from "./logger";
import { addPlayEvent, getDB } from "./storage";

export { isLoggingEnabled, setLoggingEnabled } from "./logger";

const DEFAULT_THRESHOLD_MS = 10000; // 10 seconds per user decision

let activeProviderType: ProviderType | null = null;

export interface TrackingStatus {
  healthy: boolean;
  lastSuccessfulWriteAt: number | null;
  lastSuccessfulTrackName: string | null;
  lastError: string | null;
}

let _trackingStatus: TrackingStatus = {
  healthy: true,
  lastSuccessfulWriteAt: null,
  lastSuccessfulTrackName: null,
  lastError: null,
};

let _trackingFailureNotified = false;

export function getTrackingStatus(): TrackingStatus {
  return { ..._trackingStatus };
}

export function setTrackingHealthy(healthy: boolean, error?: string): void {
  _trackingStatus.healthy = healthy;
  if (error !== undefined) _trackingStatus.lastError = error;
  else if (healthy) _trackingStatus.lastError = null;
}

const _warnedKeys = new Set<string>();
function warnOnce(key: string, msg: string, err?: unknown): void {
  if (_warnedKeys.has(key)) return;
  _warnedKeys.add(key);
  console.warn(`[listening-stats] ${msg}`, err ?? "");
}

export function isTrackingPaused(): boolean {
  try {
    return localStorage.getItem(LS_KEYS.TRACKING_PAUSED) === "1";
  } catch (e) {
    warnOnce("trackingPaused", "Failed to read trackingPaused", e);
    return false;
  }
}

export function setTrackingPaused(paused: boolean): void {
  try {
    if (paused) localStorage.setItem(LS_KEYS.TRACKING_PAUSED, "1");
    else localStorage.removeItem(LS_KEYS.TRACKING_PAUSED);
  } catch (e) {
    warnOnce("trackingPaused", "Failed to write trackingPaused", e);
  }
}

export function isSkipRepeatsEnabled(): boolean {
  try {
    return localStorage.getItem(LS_KEYS.SKIP_REPEATS) === "1";
  } catch (e) {
    warnOnce("skipRepeats", "Failed to read skipRepeats", e);
    return false;
  }
}

export function setSkipRepeatsEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(LS_KEYS.SKIP_REPEATS, "1");
      lastRecordedUri = null; // clear stale history so first play always records
    } else {
      localStorage.removeItem(LS_KEYS.SKIP_REPEATS);
    }
  } catch (e) {
    warnOnce("skipRepeats", "Failed to write skipRepeats", e);
  }
}

export function resetAccumulator(): void {
  if (isPlaying) {
    playStartTime = Date.now();
  }
  accumulatedPlayTime = 0;
  log("Accumulator reset (tracking resumed)");
}

export function getPlayThreshold(): number {
  try {
    const stored = localStorage.getItem(LS_KEYS.PLAY_THRESHOLD);
    if (stored) {
      const val = parseInt(stored, 10);
      if (val >= 0 && val <= 60000) return val; // 0-60s range
    }
  } catch (e) {
    warnOnce("threshold", "Failed to read play threshold", e);
  }
  return DEFAULT_THRESHOLD_MS;
}

export function setPlayThreshold(ms: number): void {
  localStorage.setItem(
    LS_KEYS.PLAY_THRESHOLD,
    String(Math.max(0, Math.min(60000, ms))),
  );
}

export function onStatsUpdated(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener(EVENTS.STATS_UPDATED, handler);
  return () => window.removeEventListener(EVENTS.STATS_UPDATED, handler);
}

function emitStatsUpdated(): void {
  window.dispatchEvent(new CustomEvent(EVENTS.STATS_UPDATED));
  localStorage.setItem(LS_KEYS.LAST_UPDATE, Date.now().toString());
}

function defaultPollingData(): PollingData {
  return {
    hourlyDistribution: new Array(24).fill(0),
    activityDates: [],
    knownArtistUris: [],
    skipEvents: 0,
    totalPlays: 0,
    lastPollTimestamp: 0,
    trackPlayCounts: {},
    artistPlayCounts: {},
    seeded: false,
  };
}

export function getPollingData(): PollingData {
  try {
    const stored = localStorage.getItem(LS_KEYS.POLLING_DATA);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (
        !Array.isArray(parsed.hourlyDistribution) ||
        parsed.hourlyDistribution.length !== 24
      ) {
        parsed.hourlyDistribution = new Array(24).fill(0);
      }
      if (!parsed.trackPlayCounts) parsed.trackPlayCounts = {};
      if (!parsed.artistPlayCounts) parsed.artistPlayCounts = {};
      if (parsed.seeded === undefined) parsed.seeded = false;
      return parsed;
    }
  } catch (error) {
    warn(" Failed to load polling data:", error);
  }
  return defaultPollingData();
}

function savePollingData(data: PollingData): void {
  try {
    if (data.activityDates.length > 400) {
      data.activityDates = data.activityDates.slice(-365);
    }
    if (data.knownArtistUris.length > 5000) {
      data.knownArtistUris = data.knownArtistUris.slice(-5000);
    }
    const trackEntries = Object.entries(data.trackPlayCounts);
    if (trackEntries.length > 2000) {
      const sorted = trackEntries.sort((a, b) => b[1] - a[1]).slice(0, 2000);
      data.trackPlayCounts = Object.fromEntries(sorted);
    }
    const artistEntries = Object.entries(data.artistPlayCounts);
    if (artistEntries.length > 1000) {
      const sorted = artistEntries.sort((a, b) => b[1] - a[1]).slice(0, 1000);
      data.artistPlayCounts = Object.fromEntries(sorted);
    }
    localStorage.setItem(LS_KEYS.POLLING_DATA, JSON.stringify(data));
  } catch (error) {
    warn(" Failed to save polling data:", error);
  }
}

export function clearPollingData(): void {
  localStorage.removeItem(LS_KEYS.POLLING_DATA);
}

let currentTrackUri: string | null = null;
let playStartTime: number | null = null;
let accumulatedPlayTime = 0;
let isPlaying = false;
let currentTrackDuration = 0;
let lastProgressMs = 0;
let progressHandler: (() => void) | null = null;
let lastWrittenUri: string | null = null;
let lastWrittenAt = 0;
let lastRecordedUri: string | null = null;
const DEDUP_WINDOW_MS = 500;

async function handleSongChange(): Promise<void> {
  if (currentTrackUri && playStartTime !== null) {
    const totalPlayedMs =
      accumulatedPlayTime + (isPlaying ? Date.now() - playStartTime : 0);

    const threshold = getPlayThreshold();
    const skipped =
      totalPlayedMs < threshold && currentTrackDuration > threshold;

    if (previousTrackData) {
      log(
        skipped ? "Skipped:" : "Tracked:",
        `${previousTrackData.artistName} - ${previousTrackData.trackName}`,
        `(${Math.round(totalPlayedMs / 1000)}s / ${Math.round(currentTrackDuration / 1000)}s)`,
      );
    }

    await writePlayEvent(totalPlayedMs, skipped);
  }

  const playerData = Spicetify.Player.data;
  if (playerData?.item) {
    currentTrackUri = playerData.item.uri;
    currentTrackDuration =
      playerData.item.duration?.milliseconds ||
      Spicetify.Player.getDuration() ||
      0;
    playStartTime = Date.now();
    accumulatedPlayTime = 0;
    isPlaying = !playerData.isPaused;

    const meta = playerData.item.metadata;
    const name = playerData.item.name || meta?.title || "Unknown";
    const artist = meta?.artist_name || "Unknown";
    log("Now playing:", `${artist} - ${name}`);
  } else {
    currentTrackUri = null;
    playStartTime = null;
    accumulatedPlayTime = 0;
    isPlaying = false;
    currentTrackDuration = 0;
  }
}

let previousTrackData: {
  trackUri: string;
  trackName: string;
  artistName: string;
  artistUri: string;
  albumName: string;
  albumUri: string;
  albumArt?: string;
  durationMs: number;
  startedAt: number;
} | null = null;

function captureCurrentTrackData(): void {
  const playerData = Spicetify.Player.data;
  if (!playerData?.item) {
    previousTrackData = null;
    return;
  }
  const meta = playerData.item.metadata;
  previousTrackData = {
    trackUri: playerData.item.uri,
    trackName: playerData.item.name || meta?.title || "Unknown Track",
    artistName: meta?.artist_name || "Unknown Artist",
    artistUri: meta?.artist_uri || "",
    albumName: meta?.album_title || "Unknown Album",
    albumUri: meta?.album_uri || "",
    albumArt: meta?.image_url || meta?.image_xlarge_url,
    durationMs:
      playerData.item.duration?.milliseconds ||
      Spicetify.Player.getDuration() ||
      0,
    startedAt: Date.now(),
  };
}

async function writePlayEvent(
  totalPlayedMs: number,
  skipped?: boolean,
): Promise<void> {
  if (!previousTrackData) return;

  if (isTrackingPaused()) {
    log("Tracking paused: skipping write for:", previousTrackData.trackName);
    return;
  }

  if (
    isSkipRepeatsEnabled() &&
    previousTrackData.trackUri === lastRecordedUri
  ) {
    log(
      "Skip-repeats: suppressed consecutive play for:",
      previousTrackData.trackName,
    );
    return;
  }

  const now = Date.now();
  if (
    previousTrackData.trackUri === lastWrittenUri &&
    now - lastWrittenAt < DEDUP_WINDOW_MS
  ) {
    log(
      "Dedup: suppressed duplicate write for",
      previousTrackData.trackName,
      `(${now - lastWrittenAt}ms since last write)`,
    );
    return;
  }

  // Determine skip status if not already computed by caller
  if (skipped === undefined) {
    const threshold = getPlayThreshold();
    skipped =
      totalPlayedMs < threshold && previousTrackData.durationMs > threshold;
  }

  const event: PlayEvent = {
    trackUri: previousTrackData.trackUri,
    trackName: previousTrackData.trackName,
    artistName: previousTrackData.artistName,
    artistUri: previousTrackData.artistUri,
    albumName: previousTrackData.albumName,
    albumUri: previousTrackData.albumUri,
    albumArt: previousTrackData.albumArt,
    durationMs: previousTrackData.durationMs,
    playedMs: totalPlayedMs,
    startedAt: previousTrackData.startedAt,
    endedAt: Date.now(),
    type: skipped ? "skip" : "play",
  };

  try {
    const written = await addPlayEvent(event);
    if (written) {
      // Only update polling data when event was actually written to IndexedDB
      lastWrittenUri = previousTrackData.trackUri;
      lastWrittenAt = Date.now();
      _trackingStatus.healthy = true;
      _trackingStatus.lastSuccessfulWriteAt = Date.now();
      _trackingStatus.lastSuccessfulTrackName = previousTrackData.trackName;
      _trackingStatus.lastError = null;
      _trackingFailureNotified = false;
      if (!skipped && isSkipRepeatsEnabled()) {
        lastRecordedUri = previousTrackData.trackUri; // update skip-repeats tracker
      }
      const data = getPollingData();
      data.totalPlays++;
      if (skipped) {
        data.skipEvents++;
      }
      savePollingData(data);

      if (activeProviderType === "local") {
        emitStatsUpdated();
      }
    } else {
      log("Dedup guard blocked duplicate event, polling data unchanged");
    }
  } catch (err) {
    _trackingStatus.healthy = false;
    _trackingStatus.lastError = err instanceof Error ? err.message : String(err);
    warn(" Failed to write play event:", err);
    if (!_trackingFailureNotified) {
      _trackingFailureNotified = true;
      Spicetify?.showNotification?.(
        "Tracking issue detected \u2014 try restarting Spotify",
        true,
      );
    }
  }
}

function handlePlayPause(): void {
  const wasPlaying = isPlaying;
  isPlaying = !Spicetify.Player.data?.isPaused;

  if (!currentTrackUri || playStartTime === null) return;

  if (wasPlaying && !isPlaying) {
    accumulatedPlayTime += Date.now() - playStartTime;
    log("Paused");
  } else if (!wasPlaying && isPlaying) {
    playStartTime = Date.now();
    log("Resumed");
  }
}

function handleProgress(): void {
  const progress = Spicetify.Player.getProgress(); // current position in ms
  const duration = Spicetify.Player.getDuration(); // total duration in ms
  const repeat = Spicetify.Player.getRepeat(); // 0=off, 1=all, 2=one

  // Only detect loops when repeat-one is active
  if (repeat === 2 && duration > 0) {
    // Detect position reset: was near end (>90%), now near start (<10%)
    const wasNearEnd = lastProgressMs > duration * 0.9;
    const nowNearStart = progress < duration * 0.1;

    if (wasNearEnd && nowNearStart && currentTrackUri) {
      // Song just looped -- record completed play
      log("Repeat-one loop detected, recording play");
      handleSongChange(); // Records the completed play
      captureCurrentTrackData(); // Reset for new loop tracking
    }
  }

  lastProgressMs = progress;
}

let pollIntervalId: number | null = null;
let activeSongChangeHandler: (() => void) | null = null;
let _visibilityHandler: (() => void) | null = null;

export function initPoller(providerType: ProviderType): void {
  const win = window as any;

  // Only initialize once — local tracking is permanent, never re-registered or destroyed
  if (win.__lsPollerInitialized) return;
  win.__lsPollerInitialized = true;

  activeProviderType = providerType;

  captureCurrentTrackData();
  activeSongChangeHandler = () => {
    lastProgressMs = 0; // Reset progress tracker to prevent false loop detection after real track change
    handleSongChange().catch((e) => {
      warn("songchange handler error:", e);
    });
    captureCurrentTrackData();
  };

  Spicetify.Player.addEventListener("songchange", activeSongChangeHandler);
  Spicetify.Player.addEventListener("onplaypause", handlePlayPause);

  // Register progress handler for repeat-one loop detection
  progressHandler = handleProgress;
  Spicetify.Player.addEventListener("onprogress", progressHandler);

  // Store globally so either bundle can clean up
  win.__lsSongHandler = activeSongChangeHandler;
  win.__lsPauseHandler = handlePlayPause;
  win.__lsProgressHandler = progressHandler;

  const playerData = Spicetify.Player.data;
  if (playerData?.item) {
    currentTrackUri = playerData.item.uri;
    currentTrackDuration =
      playerData.item.duration?.milliseconds ||
      Spicetify.Player.getDuration() ||
      0;
    playStartTime = Date.now();
    isPlaying = !playerData.isPaused;
  }

  // Watchdog: re-register listeners if they go missing (e.g., after sleep/wake)
  if (pollIntervalId !== null) clearInterval(pollIntervalId);
  pollIntervalId = setInterval(() => {
    if (!win.__lsSongHandler) {
      warn("Watchdog: songchange listener lost, re-registering");
      activeSongChangeHandler = () => {
        lastProgressMs = 0;
        handleSongChange().catch((e) => {
          warn("songchange handler error:", e);
        });
        captureCurrentTrackData();
      };
      progressHandler = handleProgress;
      Spicetify.Player.addEventListener("songchange", activeSongChangeHandler);
      Spicetify.Player.addEventListener("onplaypause", handlePlayPause);
      Spicetify.Player.addEventListener("onprogress", progressHandler);
      win.__lsSongHandler = activeSongChangeHandler;
      win.__lsPauseHandler = handlePlayPause;
      win.__lsProgressHandler = progressHandler;
    }
  }, 300_000) as unknown as number; // Check every 5 minutes

  // Sleep/wake re-verification: when the page becomes visible again, re-check
  // listeners and ping the DB to force reconnect if the connection went stale
  if (_visibilityHandler) {
    document.removeEventListener("visibilitychange", _visibilityHandler);
  }
  _visibilityHandler = () => {
    if (document.visibilityState !== "visible") return;
    // Re-verify event listeners
    if (!win.__lsSongHandler) {
      warn("Visibility restored: songchange listener lost, re-registering");
      activeSongChangeHandler = () => {
        lastProgressMs = 0;
        handleSongChange().catch((e) => {
          warn("songchange handler error:", e);
        });
        captureCurrentTrackData();
      };
      progressHandler = handleProgress;
      Spicetify.Player.addEventListener("songchange", activeSongChangeHandler);
      Spicetify.Player.addEventListener("onplaypause", handlePlayPause);
      Spicetify.Player.addEventListener("onprogress", progressHandler);
      win.__lsSongHandler = activeSongChangeHandler;
      win.__lsPauseHandler = handlePlayPause;
      win.__lsProgressHandler = progressHandler;
    }
    // Ping DB to force reconnect if stale
    getDB().catch(() => {
      warn("Visibility restored: DB ping failed, connection will reconnect on next write");
    });
  };
  document.addEventListener("visibilitychange", _visibilityHandler);
}

export function destroyPoller(): void {
  // No-op: local tracking is permanent and never destroyed.
  // Managed exclusively by extension.js — survives all provider switches.
}
