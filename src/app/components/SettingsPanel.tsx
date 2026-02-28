import {
  exportRawEventsAsCSV,
  exportRawEventsAsJSON,
  exportStatsAsCSV,
  exportStatsAsJSON,
} from "../../services/export";
import * as LastFm from "../../services/lastfm";
import { getPreferences, setPreference } from "../../services/preferences";

import {
  activateProvider,
  clearProviderSelection,
  getActiveProvider,
  getSelectedProviderType,
} from "../../services/providers";
import { clearApiCaches, resetRateLimit } from "../../services/spotify-api";
import { clearStatsCache } from "../../services/stats";
import * as Statsfm from "../../services/statsfm";
import { clearAllData as clearIndexedDB, deduplicateExistingEvents } from "../../services/storage";
import { error } from "../../services/logger";
import {
  clearPollingData,
  isLoggingEnabled,
  isSkipRepeatsEnabled,
  isTrackingPaused,
  resetAccumulator,
  setLoggingEnabled,
  setSkipRepeatsEnabled,
  setTrackingPaused,
} from "../../services/tracker";
import { ListeningStats, ProviderType } from "../../types/listeningstats";
import { Icons } from "../icons";
import { LS_KEYS, EVENTS, clearAllLocalStorage } from "../../constants";

const { useState, useReducer } = Spicetify.React;

// --- Reducer: Provider Form State ---

interface ProviderFormState {
  showProviderPicker: boolean;
  lfmUsername: string;
  lfmApiKey: string;
  lfmValidating: boolean;
  lfmError: string;
  sfmUsername: string;
  sfmValidating: boolean;
  sfmError: string;
}

type ProviderFormAction =
  | { type: "TOGGLE_PICKER" }
  | { type: "CLOSE_PICKER" }
  | { type: "SET_LFM_FIELD"; field: "username" | "apiKey"; value: string }
  | { type: "LFM_VALIDATE_START" }
  | { type: "LFM_VALIDATE_ERROR"; error: string }
  | { type: "LFM_VALIDATE_SUCCESS" }
  | { type: "SET_SFM_USERNAME"; value: string }
  | { type: "SFM_VALIDATE_START" }
  | { type: "SFM_VALIDATE_ERROR"; error: string }
  | { type: "SFM_VALIDATE_SUCCESS" };

function providerFormReducer(state: ProviderFormState, action: ProviderFormAction): ProviderFormState {
  switch (action.type) {
    case "TOGGLE_PICKER":
      return { ...state, showProviderPicker: !state.showProviderPicker };
    case "CLOSE_PICKER":
      return { ...state, showProviderPicker: false };
    case "SET_LFM_FIELD":
      return { ...state, [action.field === "username" ? "lfmUsername" : "lfmApiKey"]: action.value };
    case "LFM_VALIDATE_START":
      return { ...state, lfmValidating: true, lfmError: "" };
    case "LFM_VALIDATE_ERROR":
      return { ...state, lfmValidating: false, lfmError: action.error };
    case "LFM_VALIDATE_SUCCESS":
      return { ...state, lfmValidating: false, lfmError: "", lfmUsername: "", lfmApiKey: "" };
    case "SET_SFM_USERNAME":
      return { ...state, sfmUsername: action.value };
    case "SFM_VALIDATE_START":
      return { ...state, sfmValidating: true, sfmError: "" };
    case "SFM_VALIDATE_ERROR":
      return { ...state, sfmValidating: false, sfmError: action.error };
    case "SFM_VALIDATE_SUCCESS":
      return { ...state, sfmValidating: false, sfmError: "", sfmUsername: "" };
    default:
      return state;
  }
}

// --- Reducer: Display Preferences State ---

interface DisplayPrefsState {
  use24h: boolean;
  itemCount: number;
  genreCount: number;
  hiddenSections: string[];
}

type DisplayPrefsAction =
  | { type: "SET_USE_24H"; value: boolean }
  | { type: "SET_ITEM_COUNT"; value: number }
  | { type: "SET_GENRE_COUNT"; value: number }
  | { type: "TOGGLE_SECTION"; sectionId: string }
  | { type: "RESET_DISPLAY"; itemCount: number; genreCount: number };

function displayPrefsReducer(state: DisplayPrefsState, action: DisplayPrefsAction): DisplayPrefsState {
  switch (action.type) {
    case "SET_USE_24H":
      return { ...state, use24h: action.value };
    case "SET_ITEM_COUNT":
      return { ...state, itemCount: action.value };
    case "SET_GENRE_COUNT":
      return { ...state, genreCount: action.value };
    case "TOGGLE_SECTION": {
      const isHidden = state.hiddenSections.includes(action.sectionId);
      return {
        ...state,
        hiddenSections: isHidden
          ? state.hiddenSections.filter((s) => s !== action.sectionId)
          : [...state.hiddenSections, action.sectionId],
      };
    }
    case "RESET_DISPLAY":
      return { ...state, hiddenSections: [], itemCount: action.itemCount, genreCount: action.genreCount };
    default:
      return state;
  }
}

// --- Reducer: Advanced Toggles State ---

interface AdvancedState {
  loggingOn: boolean;
  trackingPaused: boolean;
  skipRepeats: boolean;
  dedupRunning: boolean;
}

type AdvancedAction =
  | { type: "SET_LOGGING"; value: boolean }
  | { type: "SET_TRACKING_PAUSED"; value: boolean }
  | { type: "SET_SKIP_REPEATS"; value: boolean }
  | { type: "SET_DEDUP_RUNNING"; value: boolean };

function advancedReducer(state: AdvancedState, action: AdvancedAction): AdvancedState {
  switch (action.type) {
    case "SET_LOGGING":
      return { ...state, loggingOn: action.value };
    case "SET_TRACKING_PAUSED":
      return { ...state, trackingPaused: action.value };
    case "SET_SKIP_REPEATS":
      return { ...state, skipRepeats: action.value };
    case "SET_DEDUP_RUNNING":
      return { ...state, dedupRunning: action.value };
    default:
      return state;
  }
}

// ---

function SettingsCategory({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="settings-category">
      <button
        className={`settings-category-header ${open ? "open" : ""}`}
        onClick={() => setOpen(!open)}
      >
        <span>{title}</span>
        <span className={`settings-chevron ${open ? "open" : ""}`} />
      </button>
      {open && <div className="settings-category-body">{children}</div>}
    </div>
  );
}

interface SettingsPanelProps {
  onRefresh: () => void;
  onCheckUpdates: () => void;
  onProviderChanged?: () => void;
  onClose?: () => void;
  onReset?: () => void;
  stats?: ListeningStats | null;
  period?: string;
}

const PROVIDER_NAMES: Record<ProviderType, string> = {
  local: "Local Tracking",
  lastfm: "Last.fm",
  statsfm: "stats.fm",
};

export function SettingsPanel({
  onRefresh,
  onCheckUpdates,
  onProviderChanged,
  onClose,
  onReset,
  stats,
  period,
}: SettingsPanelProps) {
  const { Toggle } = Spicetify.ReactComponent;
  const currentProvider = getSelectedProviderType();

  const [provForm, dispatchProv] = useReducer(providerFormReducer, {
    showProviderPicker: false,
    lfmUsername: "",
    lfmApiKey: "",
    lfmValidating: false,
    lfmError: "",
    sfmUsername: "",
    sfmValidating: false,
    sfmError: "",
  });

  const prefs = getPreferences();

  const [display, dispatchDisplay] = useReducer(displayPrefsReducer, {
    use24h: prefs.use24HourTime,
    itemCount: prefs.itemsPerSection,
    genreCount: prefs.genresPerSection,
    hiddenSections: prefs.hiddenSections,
  });

  const [advanced, dispatchAdv] = useReducer(advancedReducer, {
    loggingOn: isLoggingEnabled(),
    trackingPaused: isTrackingPaused(),
    skipRepeats: isSkipRepeatsEnabled(),
    dedupRunning: false,
  });

  const lfmConnected = LastFm.isConnected();
  const lfmConfig = LastFm.getConfig();
  const sfmConnected = Statsfm.isConnected();
  const sfmConfig = Statsfm.getConfig();

  const switchProvider = (type: ProviderType) => {
    activateProvider(type);
    dispatchProv({ type: "CLOSE_PICKER" });
    onProviderChanged?.();
  };

  const handleCleanDuplicates = async () => {
    dispatchAdv({ type: "SET_DEDUP_RUNNING", value: true });
    try {
      const result = await deduplicateExistingEvents();
      if (result.removed > 0) {
        Spicetify.showNotification(
          `Removed ${result.removed} duplicate entries across ${result.affectedTracks} tracks`
        );
      } else {
        Spicetify.showNotification("No duplicates found");
      }
    } catch (err) {
      error("Clean duplicates failed:", err);
      Spicetify.showNotification("Failed to clean duplicates");
    } finally {
      dispatchAdv({ type: "SET_DEDUP_RUNNING", value: false });
      clearStatsCache();
      onRefresh();
    }
  };

  const handleLastfmSwitch = async () => {
    if (!provForm.lfmUsername.trim() || !provForm.lfmApiKey.trim()) {
      dispatchProv({ type: "LFM_VALIDATE_ERROR", error: "Both fields are required" });
      return;
    }
    dispatchProv({ type: "LFM_VALIDATE_START" });
    try {
      const info = await LastFm.validateUser(
        provForm.lfmUsername.trim(),
        provForm.lfmApiKey.trim(),
      );
      LastFm.saveConfig({ username: info.username, apiKey: provForm.lfmApiKey.trim() });
      dispatchProv({ type: "LFM_VALIDATE_SUCCESS" });
      switchProvider("lastfm");
    } catch (err: any) {
      dispatchProv({ type: "LFM_VALIDATE_ERROR", error: err.message || "Connection failed" });
    }
  };

  const handleStatsfmSwitch = async () => {
    if (!provForm.sfmUsername.trim()) {
      dispatchProv({ type: "SFM_VALIDATE_ERROR", error: "Username is required" });
      return;
    }
    dispatchProv({ type: "SFM_VALIDATE_START" });
    try {
      const info = await Statsfm.validateUser(provForm.sfmUsername.trim());
      Statsfm.saveConfig({ username: info.customId, isPlus: info.isPlus });
      dispatchProv({ type: "SFM_VALIDATE_SUCCESS" });
      switchProvider("statsfm");
    } catch (err: any) {
      dispatchProv({ type: "SFM_VALIDATE_ERROR", error: err.message || "Connection failed" });
    }
  };

  const handleSfmDisconnect = () => {
    Statsfm.clearConfig();
    Statsfm.clearStatsfmCache();
    Spicetify.showNotification("Disconnected from stats.fm");
    onRefresh();
  };

  const handleLfmDisconnect = () => {
    LastFm.clearConfig();
    LastFm.clearLastfmCache();
    Spicetify.showNotification("Disconnected from Last.fm");
    onRefresh();
  };

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h3 className="settings-title">Settings</h3>
        {onClose && (
          <button
            className="settings-close-btn"
            onClick={onClose}
            dangerouslySetInnerHTML={{ __html: Icons.close || "&times;" }}
          />
        )}
      </div>

      {/* --- Data Source --- */}
      <SettingsCategory title="Data Source" defaultOpen>
        <div className="settings-provider-current">
          <span>
            Currently using:{" "}
            <strong>
              {currentProvider ? PROVIDER_NAMES[currentProvider] : "None"}
            </strong>
          </span>
          <button
            className="footer-btn"
            onClick={() => dispatchProv({ type: "TOGGLE_PICKER" })}
          >
            Change
          </button>
        </div>

        {!provForm.showProviderPicker && (
          <div className="provider-guides-row">
            {currentProvider !== "statsfm" && !sfmConnected && (
              <a
                className="provider-setup-link"
                href="https://github.com/Xndr2/listening-stats/wiki/stats.fm-Setup-Guide"
                target="_blank"
                rel="noopener noreferrer"
              >
                stats.fm Setup Guide{" "}
                <span dangerouslySetInnerHTML={{ __html: Icons.external }} />
              </a>
            )}
            {currentProvider !== "lastfm" && !lfmConnected && (
              <a
                className="provider-setup-link"
                href="https://github.com/Xndr2/listening-stats/wiki/Last.fm-Setup-Guide"
                target="_blank"
                rel="noopener noreferrer"
              >
                Last.fm Setup Guide{" "}
                <span dangerouslySetInnerHTML={{ __html: Icons.external }} />
              </a>
            )}
          </div>
        )}

        {provForm.showProviderPicker && (
          <div className="settings-provider-picker">
            {sfmConnected || currentProvider === "statsfm" ? (
              <div
                className={`provider-option ${currentProvider === "statsfm" ? "active" : ""}`}
                onClick={() => switchProvider("statsfm")}
                role="button"
                tabIndex={0}
              >
                <strong>stats.fm</strong>
                <span>Connected as {sfmConfig?.username || "..."}</span>
                <a
                  className="provider-setup-link"
                  href="https://github.com/Xndr2/listening-stats/wiki/stats.fm-Setup-Guide"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e: any) => e.stopPropagation()}
                >
                  View Setup Guide{" "}
                  <span dangerouslySetInnerHTML={{ __html: Icons.external }} />
                </a>
              </div>
            ) : (
              <div className="provider-option lastfm-setup">
                <strong>stats.fm</strong>
                <div className="setup-lastfm-form compact">
                  <input
                    className="lastfm-input"
                    type="text"
                    placeholder="stats.fm username"
                    value={provForm.sfmUsername}
                    onChange={(e: any) => dispatchProv({ type: "SET_SFM_USERNAME", value: e.target.value })}
                    disabled={provForm.sfmValidating}
                  />
                  {provForm.sfmError && <div className="lastfm-error">{provForm.sfmError}</div>}
                  <button
                    className="footer-btn primary"
                    onClick={handleStatsfmSwitch}
                    disabled={provForm.sfmValidating}
                  >
                    {provForm.sfmValidating ? "Connecting..." : "Connect & Switch"}
                  </button>
                </div>
                <a
                  className="provider-setup-link"
                  href="https://github.com/Xndr2/listening-stats/wiki/stats.fm-Setup-Guide"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Setup Guide{" "}
                  <span dangerouslySetInnerHTML={{ __html: Icons.external }} />
                </a>
              </div>
            )}
            {lfmConnected || currentProvider === "lastfm" ? (
              <div
                className={`provider-option ${currentProvider === "lastfm" ? "active" : ""}`}
                onClick={() => switchProvider("lastfm")}
                role="button"
                tabIndex={0}
              >
                <strong>Last.fm</strong>
                <span>Connected as {lfmConfig?.username || "..."}</span>
                <a
                  className="provider-setup-link"
                  href="https://github.com/Xndr2/listening-stats/wiki/Last.fm-Setup-Guide"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e: any) => e.stopPropagation()}
                >
                  View Setup Guide{" "}
                  <span dangerouslySetInnerHTML={{ __html: Icons.external }} />
                </a>
              </div>
            ) : (
              <div className="provider-option lastfm-setup">
                <strong>Last.fm</strong>
                <div className="setup-lastfm-form compact">
                  <input
                    className="lastfm-input"
                    type="text"
                    placeholder="Username"
                    value={provForm.lfmUsername}
                    onChange={(e: any) => dispatchProv({ type: "SET_LFM_FIELD", field: "username", value: e.target.value })}
                    disabled={provForm.lfmValidating}
                  />
                  <input
                    className="lastfm-input"
                    type="text"
                    placeholder="API key"
                    value={provForm.lfmApiKey}
                    onChange={(e: any) => dispatchProv({ type: "SET_LFM_FIELD", field: "apiKey", value: e.target.value })}
                    disabled={provForm.lfmValidating}
                  />
                  {provForm.lfmError && <div className="lastfm-error">{provForm.lfmError}</div>}
                  <button
                    className="footer-btn primary"
                    onClick={handleLastfmSwitch}
                    disabled={provForm.lfmValidating}
                  >
                    {provForm.lfmValidating ? "Connecting..." : "Connect & Switch"}
                  </button>
                </div>
                <a
                  className="provider-setup-link"
                  href="https://github.com/Xndr2/listening-stats/wiki/Last.fm-Setup-Guide"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Setup Guide{" "}
                  <span dangerouslySetInnerHTML={{ __html: Icons.external }} />
                </a>
              </div>
            )}
            <button
              className={`provider-option ${currentProvider === "local" ? "active" : ""}`}
              onClick={() => switchProvider("local")}
            >
              <strong>Local Tracking</strong>
              <span>Tracks on this device with IndexedDB</span>
            </button>
          </div>
        )}

        {currentProvider === "lastfm" && lfmConnected && lfmConfig && (
          <div className="settings-lastfm">
            <h4 className="settings-section-title">Last.fm Account</h4>
            <div className="settings-lastfm-connected">
              <div className="settings-lastfm-info">
                <span
                  className="lastfm-status-icon"
                  dangerouslySetInnerHTML={{ __html: Icons.check }}
                />
                <span>
                  Connected as <strong>{lfmConfig.username}</strong>
                </span>
              </div>
              <button
                className="footer-btn danger"
                onClick={() => {
                  handleLfmDisconnect();
                  switchProvider("local");
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        )}

        {currentProvider === "statsfm" && sfmConnected && sfmConfig && (
          <div className="settings-lastfm">
            <h4 className="settings-section-title">stats.fm Account</h4>
            <div className="settings-lastfm-connected">
              <div className="settings-lastfm-info">
                <span
                  className="lastfm-status-icon"
                  dangerouslySetInnerHTML={{ __html: Icons.check }}
                />
                <span>
                  Connected as <strong>{sfmConfig.username}</strong>
                </span>
              </div>
              <button
                className="footer-btn danger"
                onClick={() => {
                  handleSfmDisconnect();
                  switchProvider("local");
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        )}
      </SettingsCategory>

      {/* --- Display --- */}
      <SettingsCategory title="Display">
        <div className="settings-toggle-row">
          <div className="settings-toggle-info">
            <h4 className="settings-section-title">24-hour time</h4>
            <p className="settings-toggle-desc">
              Show times as 14:00 instead of 2pm
            </p>
          </div>
          <Toggle
            value={display.use24h}
            onSelected={(next: boolean) => {
              setPreference("use24HourTime", next);
              dispatchDisplay({ type: "SET_USE_24H", value: next });
            }}
          />
        </div>

        <div className="settings-toggle-row">
          <div className="settings-toggle-info">
            <h4 className="settings-section-title">Items per section</h4>
            <p className="settings-toggle-desc">
              Number of tracks, artists, and albums shown in each list
            </p>
          </div>
          <div className="settings-item-count-picker">
            {[3, 5, 10].map((n) => (
              <button
                key={n}
                className={`settings-count-btn ${display.itemCount === n ? "active" : ""}`}
                onClick={() => {
                  setPreference("itemsPerSection", n);
                  dispatchDisplay({ type: "SET_ITEM_COUNT", value: n });
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-toggle-row">
          <div className="settings-toggle-info">
            <h4 className="settings-section-title">Genres shown</h4>
            <p className="settings-toggle-desc">
              Number of genres displayed in the Top Genres section
            </p>
          </div>
          <div className="settings-item-count-picker">
            {[3, 5, 10].map((n) => (
              <button
                key={n}
                className={`settings-count-btn ${display.genreCount === n ? "active" : ""}`}
                onClick={() => {
                  setPreference("genresPerSection", n);
                  dispatchDisplay({ type: "SET_GENRE_COUNT", value: n });
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section-vis">
          <h4 className="settings-section-title">Visible sections</h4>
          <p className="settings-toggle-desc">
            Toggle which sections appear on the dashboard
          </p>
          {[
            { id: "overview", label: "Overview" },
            { id: "toplists", label: "Top Lists" },
            { id: "genres", label: "Top Genres" },
            { id: "activity", label: "Activity Chart" },
            { id: "recent", label: "Recently Played" },
          ].map(({ id, label }) => {
            const isHidden = display.hiddenSections.includes(id);
            return (
              <div key={id} className="settings-toggle-row compact">
                <span className="settings-vis-label">{label}</span>
                <Toggle
                  value={!isHidden}
                  onSelected={() => {
                    const newHidden = display.hiddenSections.includes(id)
                      ? display.hiddenSections.filter((s) => s !== id)
                      : [...display.hiddenSections, id];
                    setPreference("hiddenSections", newHidden);
                    dispatchDisplay({ type: "TOGGLE_SECTION", sectionId: id });
                  }}
                />
              </div>
            );
          })}
        </div>
      </SettingsCategory>

      {/* --- Layout --- */}
      <SettingsCategory title="Layout">
        <div className="settings-toggle-row">
          <div className="settings-toggle-info">
            <h4 className="settings-section-title">Card Order</h4>
            <p className="settings-toggle-desc">
              Drag section headers on the main page to reorder cards.
            </p>
          </div>
          <button
            className="footer-btn"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent(EVENTS.RESET_LAYOUT),
              );
              setPreference("hiddenSections", []);
              setPreference("itemsPerSection", 5);
              setPreference("genresPerSection", 5);
              dispatchDisplay({ type: "RESET_DISPLAY", itemCount: 5, genreCount: 5 });
              Spicetify.showNotification("Layout reset to default");
            }}
          >
            Reset to Default
          </button>
        </div>
        <div className="settings-toggle-row">
          <div className="settings-toggle-info">
            <h4 className="settings-section-title">Feature Tour</h4>
            <p className="settings-toggle-desc">
              Walk through the app's features with a guided tooltip tour.
            </p>
          </div>
          <button
            className="footer-btn"
            onClick={() => {
              onClose?.();
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent(EVENTS.START_TOUR));
              }, 300);
            }}
          >
            Restart Tour
          </button>
        </div>
      </SettingsCategory>


      {/* --- Advanced --- */}
      <SettingsCategory title="Advanced">
        {/* Toggles grouped together */}
        <div className="settings-toggle-row">
          <div className="settings-toggle-info">
            <h4 className="settings-section-title">Console Logging</h4>
            <p className="settings-toggle-desc">
              Log tracked songs, skips, and playback events to the browser
              console (F12).
            </p>
          </div>
          <Toggle
            value={advanced.loggingOn}
            onSelected={(next: boolean) => {
              setLoggingEnabled(next);
              dispatchAdv({ type: "SET_LOGGING", value: next });
              Spicetify.showNotification(
                next
                  ? "Logging enabled. Open DevTools (Ctrl + Shift + I) to see output"
                  : "Logging disabled",
              );
            }}
          />
        </div>

        {currentProvider === "local" && (
          <>
            <div className="settings-toggle-row">
              <div className="settings-toggle-info">
                <h4 className="settings-section-title">Pause Tracking</h4>
                <p className="settings-toggle-desc">
                  Stop recording plays. Resume to start tracking again from this point.
                </p>
              </div>
              <Toggle
                value={advanced.trackingPaused}
                onSelected={(next: boolean) => {
                  setTrackingPaused(next);
                  if (!next) resetAccumulator();
                  dispatchAdv({ type: "SET_TRACKING_PAUSED", value: next });
                  Spicetify.showNotification(next ? "Tracking paused" : "Tracking resumed");
                }}
              />
            </div>

            <div className="settings-toggle-row">
              <div className="settings-toggle-info">
                <h4 className="settings-section-title">Skip Repeats</h4>
                <p className="settings-toggle-desc">
                  Don't record the same song twice in a row.
                </p>
              </div>
              <Toggle
                value={advanced.skipRepeats}
                onSelected={(next: boolean) => {
                  setSkipRepeatsEnabled(next);
                  dispatchAdv({ type: "SET_SKIP_REPEATS", value: next });
                }}
              />
            </div>
          </>
        )}

        {/* Buttons grouped together */}
        <div className="settings-actions-row">
          <button
            className="footer-btn"
            onClick={() => {
              clearStatsCache();
              onRefresh();
            }}
          >
            Refresh
          </button>
          <button
            className="footer-btn"
            onClick={() => {
              resetRateLimit();
              clearApiCaches();
              clearStatsCache();
              LastFm.clearLastfmCache();
              Statsfm.clearStatsfmCache();
              Spicetify.showNotification("Cache cleared");
            }}
          >
            Clear Cache
          </button>
          <button className="footer-btn" onClick={onCheckUpdates}>
            Check Updates
          </button>
          {currentProvider === "local" && (
            <button
              className="footer-btn"
              onClick={handleCleanDuplicates}
              disabled={advanced.dedupRunning}
            >
              {advanced.dedupRunning ? "Cleaning..." : "Clean Duplicates"}
            </button>
          )}
        </div>

        {/* Export sub-section */}
        <div className="settings-export">
          <h4 className="settings-section-title">Export Data</h4>
          <div className="settings-actions-row">
            <button
              className="footer-btn"
              disabled={!stats}
              onClick={() =>
                stats && period && exportStatsAsJSON(stats, period)
              }
            >
              Export JSON
            </button>
            <button
              className="footer-btn"
              disabled={!stats}
              onClick={() =>
                stats && period && exportStatsAsCSV(stats, period)
              }
            >
              Export CSV
            </button>
            {currentProvider === "local" && (
              <>
                <button
                  className="footer-btn"
                  onClick={() => {
                    exportRawEventsAsJSON();
                    Spicetify.showNotification("Exporting...");
                  }}
                >
                  Raw History (JSON)
                </button>
                <button
                  className="footer-btn"
                  onClick={() => {
                    exportRawEventsAsCSV();
                    Spicetify.showNotification("Exporting...");
                  }}
                >
                  Raw History (CSV)
                </button>
              </>
            )}
          </div>
        </div>

        {/* Danger Zone sub-section */}
        <div className="settings-danger-zone">
          <h4 className="settings-section-title">Danger Zone</h4>
          <p className="settings-danger-desc">
            Wipe all data and return to the setup screen. This clears the
            IndexedDB database, all saved accounts, caches, and preferences.
          </p>
          {currentProvider === "local" && (
            <button
              className="footer-btn danger"
              style={{ marginBottom: 8 }}
              onClick={() => {
                if (
                  confirm(
                    "Delete all local tracking data? This cannot be undone.",
                  )
                ) {
                  clearIndexedDB();
                  clearPollingData();
                  Spicetify.showNotification("All local data cleared");
                  onRefresh();
                }
              }}
            >
              Reset Local Data
            </button>
          )}
          <button
            className="footer-btn danger"
            onClick={() => {
              if (
                confirm(
                  "This will delete ALL data including your IndexedDB history, saved accounts, and preferences. This cannot be undone. Continue?",
                )
              ) {
                clearIndexedDB();
                clearPollingData();
                clearStatsCache();
                clearApiCaches();
                resetRateLimit();
                LastFm.clearConfig();
                LastFm.clearLastfmCache();
                Statsfm.clearConfig();
                Statsfm.clearStatsfmCache();
                clearProviderSelection();
                clearAllLocalStorage();
                onReset?.();
              }
            }}
          >
            Wipe Everything
          </button>
        </div>
      </SettingsCategory>

    </div>
  );
}
