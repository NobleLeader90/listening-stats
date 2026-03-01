# Changelog

## 1.3.70

### Added

- **Tracking health indicator** — green/red status dot in header shows whether local tracking is active, with Spicetify tooltip on hover
- **Write-failure notifications** — toast alert on first IndexedDB write failure per session with actionable hint, suppressed on subsequent failures to avoid spam
- **Startup integrity check** — verifies IndexedDB store, indexes, and write roundtrip on local provider init; shows toast and marks unhealthy on failure
- **Sleep/wake recovery** — visibilitychange handler re-verifies tracking pipeline and reconnects stale DB connections after system resume
- **Test Tracking button** — manual pipeline test in Settings > Advanced with running/success/failure states
- **Last Tracked display** — shows most recent tracked song and relative time in Settings > Advanced
- **Console debug API** — `window.ListeningStats` expanded with `getTrackingStatus()`, `getLogs()`, `getLastError()`, `testWrite()` for diagnosing tracking issues
- **Ring buffer logging** — last 100 log entries captured in memory regardless of logging toggle, accessible via console API

### Changed

- **Extension loading** — background extension renamed to `extension.js` and loaded via `subfiles_extension` in manifest.json instead of requiring separate Spicetify extension registration
- **Init retry cap** — initialization retries capped at 50 attempts (5 seconds) with user-facing error notification on timeout instead of polling forever

### Fixed

- **Silent tracking failure** — tracking pipeline failures now detected and surfaced to user instead of silently losing data (GitHub #16)

## 1.3.68

### Added

- **Tracking controls** — pause/resume tracking and skip-repeat detection toggle in Advanced settings
- **Period persistence** — selected time period is remembered across navigation and page reloads
- **Playlist automation** — auto-updating playlists from your top tracks, configurable in settings

### Changed

- **Centralized constants** — all localStorage keys and event names defined in a single module
- **Shared streak utility** — streak calculation extracted to a shared function, zero duplication across providers
- **SettingsPanel refactored** — 16 useState calls consolidated into 3 useReducer groups
- **Native Spicetify components** — custom PortalTooltip replaced with TooltipWrapper, custom toggles replaced with Spicetify Toggle
- **Spicetify built-in APIs** — URI parsing uses URI.fromString(), clipboard uses Platform.ClipboardAPI, formatting uses Spicetify.Locale
- **Error handling standardized** — silent catch blocks replaced with logged warnings across all services

### Fixed

- **Double scrobbling** — debounce guard prevents duplicate play events from rapid Spotify events
- **Top track ordering** — sort comparators now correctly rank by play count/listen time
- **Local provider artist images** — top artists now enriched with Spotify images
- **Stats refresh** — quiet in-place update instead of full page refresh
- **Console logging** — all output routed through shared logger with toggle control

## 1.3.27

### Added

- **Top Genres section** — horizontal bar chart showing your most listened genres ranked by play count, with accent-colored fill bars and stagger animations (stats.fm provider)
- **Section visibility toggles** — hide or show individual dashboard sections (Overview, Top Lists, Top Genres, Activity, Recently Played) from Settings > Display
- **Items per section** — choose how many tracks, artists, and albums to show (3, 5, or 10)
- **Genres per section** — choose how many genres to show (3, 5, or 10)
- **Genre tour step** — guided tour now highlights the Top Genres section when using stats.fm
- **Entrance animations** — genre bars fade in with staggered delays, activity chart bars grow upward with ripple effect

### Changed

- **Share cards redesigned** — both story and landscape cards now use full blurred backgrounds, larger album art with glow effects, bigger fonts, and a consistent ranked list layout. Landscape card increased to 1600x900 with 3-column layout. Story card shows 5 artists in ranked rows instead of 3 circular images
- **Share card preview** enlarged for better visibility before sharing
- **Reset to Default** now also resets hidden sections, items per section, and genres per section back to defaults
- **Top list cards** no longer have fixed minimum height — they shrink to fit content when showing fewer items

### Fixed

- **IndexedDB fresh install crash** — opening the DB without an existing version no longer creates an empty v1 database
- **Spotify API removal** — removed unused `lazyNavigate` and `getArtistsBatch` calls that could cause errors
- **stats.fm promo popup** no longer shows after switching to stats.fm via settings
- **Last.fm hourly chart** — ranked stats now populate hourly distribution from recent tracks instead of showing all zeros
- **Local streak accuracy** — streak is now computed from all-time events instead of period-filtered events
- **Settings modal stability** — changing display preferences no longer closes the settings panel
- **Advanced settings spacing** — Export Data section now has proper border separator and consistent margins

## 1.3.2

### Added

- Drag-and-drop section reordering — rearrange your dashboard layout, persists across restarts
- Guided setup wizard with step-by-step provider tutorials for stats.fm and Last.fm
- Feature walkthrough tour on first use, restartable from settings
- stats.fm auto-detects free vs premium and shows the correct time periods
- Formatted markdown changelog in update banner
- Announcement banner under header, fetched from GitHub
- Setup guide links for unconfigured providers in settings

### Changed

- Settings panel redesigned with collapsible categories (Data Source, Display, Layout, Advanced)
- Advanced settings organized into Diagnostics, Export, and Danger Zone sub-sections
- All numbers now display with locale-aware formatting (e.g. 64,143)
- 24-hour time toggle in settings with instant updates across the app
- Stat card tooltips explaining each metric on hover
- Heart/like buttons visible on all tracks, disabled icon for tracks without Spotify URI
- API resilience layer with priority queue, dedup, and circuit breaker for rate limiting
- Clear error messaging distinguishing "no data" from "fetch failed"

### Fixed

- Fixed data loss when upgrading to a new version (IndexedDB migration now backs up and restores)
- Fixed songs on repeat only counting once — each full play is now tracked separately
- Fixed duplicate entries in recently played
- Fixed stats.fm numbers not matching the website across different time periods
- Fixed paid-to-artist estimate using lifetime data instead of selected period
- Fixed activity chart not scoping to the selected time period
- Fixed broken cover art under rate limiting — images now retry automatically
- Fixed Last.fm cards not navigating to Spotify when clicked
- Fixed tooltips rendering behind Spotify sidebar, now-playing bar, and top bar
- Fixed tour freezing when cancelled and restarted mid-step
- Fixed page scrolling away during tour transitions

## 1.2.41

### Added

- **stats.fm provider** (recommended) connect with just your username, no API key needed. Accurate play counts and listening duration from your Spotify history
- **Setup guide links** for stats.fm and Last.fm shown in the update banner and setup screen
- **Logging toggle** optional debug logging in settings for troubleshooting

### Changed

- **Share cards redesigned** story card (1080x1920) with blurred hero background, dominant color accent, stats grid, top tracks/albums/artists, hourly activity chart, genre pills, and username display. Landscape card (1200x675) with two panel layout
- **Local tracking always active** play events are written locally regardless of selected provider
- **Last.fm time estimation** recent tab uses scrobble timestamp gaps with session break detection instead of a fixed estimate

### Fixed

- Last.fm tracks no longer show "0s" when duration data is unavailable
- Last.fm recent total time no longer stuck at 2h 55m

### Removed

- Spotify provider (relied on APIs that don't return per user play counts)
- Genre timeline component

## 1.2.0

### Added

- **Provider system** — choose between multiple data sources instead of being locked to one
  - **Last.fm provider** — connect your Last.fm account for accurate play counts and cross-device tracking with 7 time periods (7 days, 1/3/6/12 months, overall)
  - **Local provider** — on-device tracking via IndexedDB (renamed from the previous default)
  - **Spotify provider** — uses Spotify's top items and recently played APIs
- **Setup screen** — first-launch flow to choose a data provider with Last.fm validation
- **Share cards** — generate shareable stat images (story 1080x1350 or landscape 1200x630) with top tracks, artists, and stats summary. Export via clipboard, download, or native share. Shows provider source label
- **Data export** — export stats as JSON or CSV from the settings panel. Local provider can also export raw listening history
- **Genre timeline** — stacked bar visualization showing genre proportions across multiple time periods
- **Animated numbers** — overview card values count up with eased animation on load
- **Loading skeleton** — shimmer placeholder shown while stats are loading
- **Header component** — dedicated top bar with share button, settings toggle, and provider indicator
- **Last.fm banner** — link to your Last.fm profile shown in the footer when using Last.fm provider
- **Empty state** — informational screen when no data is available for the selected period
- **Period prefetching** — adjacent time periods are prefetched in the background for faster switching

### Changed

- **Stats engine rewritten** — delegates to the active provider instead of directly querying APIs. 5-minute cache keyed by provider and period
- **Tracker rewritten** — unified poller with skip detection for all providers, IndexedDB writes for local, configurable poll interval
- **Spotify API service** — added request queue with concurrency limiting (3 concurrent), automatic retry with exponential backoff on 429s, LRU response cache (200 entries, 5-min TTL)
- **Settings panel overhaul** — provider switching, Last.fm account management, cache controls, export buttons, separated into sections
- **Activity chart** — supports both local hourly distribution and Last.fm play counts per hour
- **Overview cards** — new layout with hero card, period tabs integrated, payout estimates
- **Top lists** — like buttons (hidden for Last.fm), play count display, click-to-play
- **Type system** — moved from single `src/types.ts` to modular `src/types/` directory with separate files for Spotify API types and listening stats types
- **Styles** — complete CSS overhaul with CSS custom properties for accent color theming, improved responsive layout, portal-based modals

### Fixed

- Rate limit handling — proper 429 backoff instead of hammering the API
- Event listener cleanup — stored handler references for proper `removeEventListener`
- Session recovery on extension restart
- Skip detection accuracy improved

### Removed

- Removed deprecated Spotify Audio Features API calls (deprecated by Spotify Nov 2024)
- Removed unused preference service and feature expansion types (heatmap, goals, milestones, moods)

## 1.1.0

Initial public release with local IndexedDB tracking, top tracks/artists/albums, activity chart, streak tracking, skip rate, and auto-update notifications.
