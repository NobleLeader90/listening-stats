# Changelog

## [1.3.97] - 2026-03-07

### Changed

- Derive all colors from Spicetify CSS variables (`--spice-button`, `--spice-text`, `--spice-main`, etc.) for full theme compatibility with light themes, custom accents, and high-contrast themes
- Replace ~28 hardcoded white `rgba()` overlays with text-relative overlays that adapt to light and dark themes
- Use `--spice-main` for button text on accent-colored surfaces to ensure contrast across all themes
- Replace hardcoded error colors with `--spice-notification` variable

### Added

- Add accurate Day Streak metric for all providers. Local uses IndexedDB, Last.fm probes day-by-day via API, stats.fm Plus paginates recent streams
- Add Plays/Day metric replacing Days Listened, calculated as track count divided by days in period

### Fixed

- Fix Day Streak unavailable for stats.fm free/non-Plus users now derives streak from recent streams endpoint
- Fix stats.fm streak capped at ~5 days due to 200-stream limit now paginates backwards until a day gap is found
- Fix Last.fm streak inflation caused by now-playing track included in total count
- Fix Day Streak card hidden during async load now shows skeleton placeholder
- Fix UTC date boundary bug causing incorrect streak counts near midnight
- Fix local tracking database issues causing duplicate entries

## [1.3.70] - 2026-03-02

### Changed

- Rename background extension to `extension.js` and load via `subfiles_extension` in manifest.json
- Cap initialization retries at 50 attempts (5 seconds) with user-facing error on timeout

### Added

- Add tracking health indicator with green/red status dot in header and tooltip on hover
- Add toast alert on first IndexedDB write failure per session with actionable hint
- Add startup integrity check verifying IndexedDB store, indexes, and write roundtrip on init
- Add sleep/wake recovery via visibilitychange handler that re-verifies tracking pipeline
- Add Test Tracking button in Settings > Advanced with running/success/failure states
- Add Last Tracked display showing most recent tracked song and relative time in settings
- Expand `window.ListeningStats` console API with `getTrackingStatus()`, `getLogs()`, `getLastError()`, `testWrite()`
- Add ring buffer logging capturing last 100 entries in memory regardless of logging toggle

### Fixed

- Fix silent tracking failure, pipeline failures now detected and surfaced to user ([#16])

## [1.3.68] - 2026-02-28

### Changed

- Centralize all localStorage keys and event names in a single module
- Extract streak calculation to a shared utility function
- Consolidate 16 `useState` calls into 3 `useReducer` groups in SettingsPanel
- Replace custom PortalTooltip with Spicetify TooltipWrapper and custom toggles with Spicetify Toggle
- Use Spicetify built-in APIs for URI parsing, clipboard, and locale formatting
- Replace silent `catch` blocks with logged warnings across all services

### Added

- Add pause/resume tracking and skip-repeat detection toggle in Advanced settings
- Add period persistence across navigation and page reloads
- Add auto-updating playlists from top tracks, configurable in settings

### Fixed

- Fix double scrobbling caused by rapid Spotify events via debounce guard
- Fix top track ordering, sort comparators now correctly rank by play count and listen time
- Fix missing artist images in local provider, top artists now enriched with Spotify images
- Fix stats refresh triggering full page refresh instead of quiet in-place update
- Route all console output through shared logger with toggle control

## [1.3.27] - 2026-02-15

### Changed

- Redesign share cards with full blurred backgrounds, larger album art with glow effects, and consistent ranked list layout
- Enlarge share card preview for better visibility before sharing
- Reset to Default now also resets hidden sections, items per section, and genres per section
- Remove fixed minimum height from top list cards, they shrink to fit content

### Added

- Add Top Genres section with horizontal bar chart ranked by play count (stats.fm provider)
- Add section visibility toggles in Settings > Display for Overview, Top Lists, Top Genres, Activity, and Recently Played
- Add items-per-section picker (3, 5, or 10) for tracks, artists, and albums
- Add genres-per-section picker (3, 5, or 10)
- Add genre tour step highlighting Top Genres when using stats.fm
- Add staggered entrance animations for genre bars and activity chart bars

### Fixed

- Fix IndexedDB crash on fresh install when opening DB without an existing version
- Remove unused `lazyNavigate` and `getArtistsBatch` Spotify API calls that could cause errors
- Fix stats.fm promo popup appearing after switching to stats.fm via settings
- Fix Last.fm hourly chart showing all zeros, now populates from recent tracks
- Fix local streak computed from period-filtered events instead of all-time events
- Fix settings modal closing when changing display preferences
- Fix missing border separator and margins in Advanced settings Export section

## [1.3.2] - 2026-02-11

### Changed

- Redesign settings panel with collapsible categories (Data Source, Display, Layout, Advanced)
- Organize advanced settings into Diagnostics, Export, and Danger Zone sub-sections
- Display all numbers with locale-aware formatting
- Add 24-hour time toggle with instant updates across the app
- Add stat card tooltips explaining each metric on hover
- Show heart/like buttons on all tracks with disabled icon for tracks without Spotify URI
- Add API resilience layer with priority queue, dedup, and circuit breaker for rate limiting
- Distinguish "no data" from "fetch failed" in error messaging

### Added

- Add drag-and-drop section reordering with layout persisted across restarts
- Add guided setup wizard with step-by-step provider tutorials for stats.fm and Last.fm
- Add feature walkthrough tour on first use, restartable from settings
- Auto-detect stats.fm free vs premium and show correct time periods
- Add formatted markdown changelog in update banner
- Add announcement banner under header fetched from GitHub
- Add setup guide links for unconfigured providers in settings

### Fixed

- Fix data loss when upgrading, IndexedDB migration now backs up and restores
- Fix songs on repeat only counting once, each full play now tracked separately
- Fix duplicate entries in recently played
- Fix stats.fm numbers not matching the website across time periods
- Fix paid-to-artist estimate using lifetime data instead of selected period
- Fix activity chart not scoping to the selected time period
- Fix broken cover art under rate limiting, images now retry automatically
- Fix Last.fm cards not navigating to Spotify when clicked
- Fix tooltips rendering behind Spotify sidebar, now-playing bar, and top bar
- Fix tour freezing when cancelled and restarted mid-step
- Fix page scrolling away during tour transitions

## [1.2.41] - 2026-02-06

### Changed

- Redesign share cards: story (1080x1920) with blurred hero, dominant color accent, stats grid, top items, hourly chart, genre pills; landscape (1200x675) with two-panel layout
- Keep local tracking always active regardless of selected provider
- Estimate Last.fm recent listening time from scrobble timestamp gaps with session break detection

### Added

- Add stats.fm provider, connect with just your username, no API key needed
- Add setup guide links for stats.fm and Last.fm in update banner and setup screen
- Add optional debug logging toggle in settings

### Removed

- Remove Spotify provider (relied on APIs that don't return per-user play counts)
- Remove genre timeline component

### Fixed

- Fix Last.fm tracks showing "0s" when duration data is unavailable
- Fix Last.fm recent total time stuck at 2h 55m

## [1.2.0] - 2026-02-06

### Changed

- Rewrite stats engine to delegate to active provider with 5-minute cache keyed by provider and period
- Rewrite tracker with unified poller, skip detection for all providers, and configurable poll interval
- Add request queue with concurrency limiting, exponential backoff on 429s, and LRU cache to Spotify API service
- Overhaul settings panel with provider switching, Last.fm management, cache controls, and export buttons
- Support both local hourly distribution and Last.fm play counts in activity chart
- Redesign overview cards with hero card, integrated period tabs, and payout estimates
- Add like buttons and click-to-play in top lists
- Move type system from single `src/types.ts` to modular `src/types/` directory
- Complete CSS overhaul with custom properties for accent theming, responsive layout, and portal-based modals

### Added

- Add provider system for choosing between multiple data sources
- Add Last.fm provider with 7 time periods (7 days, 1/3/6/12 months, overall)
- Add local provider with on-device IndexedDB tracking
- Add Spotify provider using top items and recently played APIs
- Add setup screen with first-launch provider selection and Last.fm validation
- Add share cards (story and landscape) with clipboard, download, and native share export
- Add data export as JSON or CSV from settings panel
- Add genre timeline with stacked bar visualization across time periods
- Add animated number count-up on overview cards
- Add loading skeleton with shimmer placeholders
- Add header component with share button, settings toggle, and provider indicator
- Add empty state screen when no data is available
- Add period prefetching for faster tab switching

### Removed

- Remove deprecated Spotify Audio Features API calls (deprecated Nov 2024)
- Remove unused preference service and feature expansion types

### Fixed

- Fix rate limit handling with proper 429 backoff
- Fix event listener cleanup with stored handler references
- Fix session recovery on extension restart
- Improve skip detection accuracy

## [1.1.0] - 2026-02-03

Initial public release with local IndexedDB tracking, top tracks/artists/albums, activity chart, streak tracking, skip rate, and auto-update notifications.

[1.3.94]: https://github.com/Xndr2/listening-stats/releases/tag/v1.3.94
[1.3.70]: https://github.com/Xndr2/listening-stats/releases/tag/v1.3.73
[1.3.68]: https://github.com/Xndr2/listening-stats/releases/tag/v1.3.68
[1.3.27]: https://github.com/Xndr2/listening-stats/releases/tag/v1.3.27
[1.3.2]: https://github.com/Xndr2/listening-stats/releases/tag/v1.3.2
[1.2.41]: https://github.com/Xndr2/listening-stats/releases/tag/v1.2.41
[1.2.0]: https://github.com/Xndr2/listening-stats/releases/tag/v1.2.1
[1.1.0]: https://github.com/Xndr2/listening-stats/releases/tag/v1.1.3
[#16]: https://github.com/Xndr2/listening-stats/issues/16
[`25f239c`]: https://github.com/Xndr2/listening-stats/commit/25f239c
[`7d18ac4`]: https://github.com/Xndr2/listening-stats/commit/7d18ac4
[`2fa78fd`]: https://github.com/Xndr2/listening-stats/commit/2fa78fd
[`0c8ab1a`]: https://github.com/Xndr2/listening-stats/commit/0c8ab1a
[`f68cad2`]: https://github.com/Xndr2/listening-stats/commit/f68cad2
