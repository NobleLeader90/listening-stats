(() => {
  // src/constants.ts
  var LS_KEYS = {
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
    PERIOD: "listening-stats:period"
  };
  var EVENTS = {
    STATS_UPDATED: "listening-stats:updated",
    PREFS_CHANGED: "listening-stats:prefs-changed",
    RESET_LAYOUT: "listening-stats:reset-layout",
    START_TOUR: "listening-stats:start-tour"
  };

  // src/services/lastfm.ts
  var LASTFM_API_URL = "https://ws.audioscrobbler.com/2.0/";
  var CACHE_TTL_MS = 3e5;
  var configCache = void 0;
  function getConfig() {
    if (configCache !== void 0) return configCache;
    try {
      const stored = localStorage.getItem(LS_KEYS.LASTFM_CONFIG);
      if (stored) {
        configCache = JSON.parse(stored);
        return configCache;
      }
    } catch (e) {
      console.warn("[listening-stats] Last.fm config read failed", e);
    }
    configCache = null;
    return null;
  }
  function clearConfig() {
    configCache = null;
    localStorage.removeItem(LS_KEYS.LASTFM_CONFIG);
  }
  var cache = /* @__PURE__ */ new Map();
  function getCached(key) {
    const entry = cache.get(key);
    if (!entry || Date.now() >= entry.expiresAt) {
      cache.delete(key);
      return null;
    }
    return entry.data;
  }
  function setCache(key, data) {
    cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  }
  var LASTFM_PLACEHOLDER_HASHES = [
    "2a96cbd8b46e442fc41c2b86b821562f",
    "c6f59c1e5e7240a4c0d427abd71f3dbb"
  ];
  function isPlaceholderImage(url) {
    return LASTFM_PLACEHOLDER_HASHES.some((h) => url.includes(h));
  }
  async function lastfmFetch(params) {
    const config = getConfig();
    if (!config) throw new Error("Last.fm not configured");
    const url = new URL(LASTFM_API_URL);
    url.searchParams.set("api_key", config.apiKey);
    url.searchParams.set("format", "json");
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    const cacheKey = url.toString();
    const cached = getCached(cacheKey);
    if (cached) return cached;
    const response = await fetch(url.toString());
    if (!response.ok) {
      if (response.status === 403) throw new Error("Invalid Last.fm API key");
      if (response.status === 429) throw new Error("Last.fm rate limited");
      throw new Error(`Last.fm API error: ${response.status}`);
    }
    const data = await response.json();
    if (data.error) {
      throw new Error(data.message || `Last.fm error ${data.error}`);
    }
    setCache(cacheKey, data);
    return data;
  }
  async function validateUser(username, apiKey) {
    const url = new URL(LASTFM_API_URL);
    url.searchParams.set("method", "user.getinfo");
    url.searchParams.set("user", username);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");
    const response = await fetch(url.toString());
    if (!response.ok) {
      if (response.status === 403) throw new Error("Invalid API key");
      throw new Error(`Validation failed: ${response.status}`);
    }
    const data = await response.json();
    if (data.error) {
      throw new Error(data.message || "User not found");
    }
    const user = data.user;
    return {
      valid: true,
      username: user.name,
      totalScrobbles: parseInt(user.playcount, 10) || 0,
      registered: user.registered?.["#text"] || "",
      imageUrl: user.image?.find((i) => i.size === "medium")?.["#text"]
    };
  }
  async function getTopTracks(period, limit = 200) {
    const config = getConfig();
    if (!config) return { tracks: [], total: 0 };
    const data = await lastfmFetch({
      method: "user.gettoptracks",
      user: config.username,
      period,
      limit: String(limit)
    });
    const total = parseInt(data.toptracks?.["@attr"]?.total || "0", 10);
    const tracks = (data.toptracks?.track || []).map((t) => {
      const img = t.image?.find((i) => i.size === "large")?.["#text"]?.trim();
      return {
        name: t.name,
        artist: t.artist?.name || "",
        playCount: parseInt(t.playcount, 10) || 0,
        mbid: t.mbid || void 0,
        url: t.url,
        imageUrl: img && !isPlaceholderImage(img) ? img : void 0,
        durationSecs: parseInt(t.duration, 10) || void 0
      };
    });
    return { tracks, total };
  }
  async function getTopArtists(period, limit = 100) {
    const config = getConfig();
    if (!config) return { artists: [], total: 0 };
    const data = await lastfmFetch({
      method: "user.gettopartists",
      user: config.username,
      period,
      limit: String(limit)
    });
    const total = parseInt(data.topartists?.["@attr"]?.total || "0", 10);
    const artists = (data.topartists?.artist || []).map((a) => {
      const img = a.image?.find((i) => i.size === "large")?.["#text"]?.trim();
      return {
        name: a.name,
        playCount: parseInt(a.playcount, 10) || 0,
        mbid: a.mbid || void 0,
        url: a.url,
        imageUrl: img && !isPlaceholderImage(img) ? img : void 0
      };
    });
    return { artists, total };
  }
  async function getTopAlbums(period, limit = 100) {
    const config = getConfig();
    if (!config) return { albums: [], total: 0 };
    const data = await lastfmFetch({
      method: "user.gettopalbums",
      user: config.username,
      period,
      limit: String(limit)
    });
    const total = parseInt(data.topalbums?.["@attr"]?.total || "0", 10);
    const albums = (data.topalbums?.album || []).map((a) => {
      const img = a.image?.find((i) => i.size === "large")?.["#text"]?.trim();
      return {
        name: a.name,
        artist: a.artist?.name || "",
        playCount: parseInt(a.playcount, 10) || 0,
        mbid: a.mbid || void 0,
        url: a.url,
        imageUrl: img && !isPlaceholderImage(img) ? img : void 0
      };
    });
    return { albums, total };
  }
  async function getRecentTracks(limit = 50) {
    const config = getConfig();
    if (!config) return [];
    const data = await lastfmFetch({
      method: "user.getrecenttracks",
      user: config.username,
      limit: String(limit)
    });
    const tracks = data.recenttracks?.track || [];
    return tracks.filter((t) => t.date || t["@attr"]?.nowplaying).map((t) => {
      const img = t.image?.find((i) => i.size === "large")?.["#text"]?.trim();
      return {
        name: t.name,
        artist: t.artist?.["#text"] || t.artist?.name || "",
        album: t.album?.["#text"] || "",
        albumArt: img && !isPlaceholderImage(img) ? img : void 0,
        playedAt: t.date?.uts ? new Date(parseInt(t.date.uts, 10) * 1e3).toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
        nowPlaying: t["@attr"]?.nowplaying === "true"
      };
    });
  }
  async function getUserInfo() {
    const config = getConfig();
    if (!config) return null;
    try {
      return await validateUser(config.username, config.apiKey);
    } catch (e) {
      console.warn("[listening-stats] Last.fm date parsing failed", e);
      return null;
    }
  }

  // src/services/logger.ts
  var RING_SIZE = 100;
  var _ring = [];
  var _ringIdx = 0;
  var _lastError = null;
  function pushRing(level, msg) {
    _ring[_ringIdx % RING_SIZE] = { level, msg, ts: Date.now() };
    _ringIdx++;
    if (level === "error") _lastError = msg;
  }
  function getLogs() {
    if (_ring.length < RING_SIZE) return [..._ring];
    const start = _ringIdx % RING_SIZE;
    return [..._ring.slice(start), ..._ring.slice(0, start)];
  }
  function getLastError() {
    return _lastError;
  }
  function isLoggingEnabled() {
    try {
      return localStorage.getItem(LS_KEYS.LOGGING) === "1";
    } catch (e) {
      console.warn("[listening-stats] Logger config access failed", e);
      return false;
    }
  }
  function log(...args) {
    pushRing("log", args.map(String).join(" "));
    if (isLoggingEnabled()) console.log("[ListeningStats]", ...args);
  }
  function warn(...args) {
    pushRing("warn", args.map(String).join(" "));
    if (isLoggingEnabled()) console.warn("[ListeningStats]", ...args);
  }
  function error(...args) {
    pushRing("error", args.map(String).join(" "));
    if (isLoggingEnabled()) console.error("[ListeningStats]", ...args);
  }

  // node_modules/idb/build/index.js
  var instanceOfAny = (object, constructors) => constructors.some((c) => object instanceof c);
  var idbProxyableTypes;
  var cursorAdvanceMethods;
  function getIdbProxyableTypes() {
    return idbProxyableTypes || (idbProxyableTypes = [
      IDBDatabase,
      IDBObjectStore,
      IDBIndex,
      IDBCursor,
      IDBTransaction
    ]);
  }
  function getCursorAdvanceMethods() {
    return cursorAdvanceMethods || (cursorAdvanceMethods = [
      IDBCursor.prototype.advance,
      IDBCursor.prototype.continue,
      IDBCursor.prototype.continuePrimaryKey
    ]);
  }
  var transactionDoneMap = /* @__PURE__ */ new WeakMap();
  var transformCache = /* @__PURE__ */ new WeakMap();
  var reverseTransformCache = /* @__PURE__ */ new WeakMap();
  function promisifyRequest(request) {
    const promise = new Promise((resolve, reject) => {
      const unlisten = () => {
        request.removeEventListener("success", success);
        request.removeEventListener("error", error2);
      };
      const success = () => {
        resolve(wrap(request.result));
        unlisten();
      };
      const error2 = () => {
        reject(request.error);
        unlisten();
      };
      request.addEventListener("success", success);
      request.addEventListener("error", error2);
    });
    reverseTransformCache.set(promise, request);
    return promise;
  }
  function cacheDonePromiseForTransaction(tx) {
    if (transactionDoneMap.has(tx))
      return;
    const done = new Promise((resolve, reject) => {
      const unlisten = () => {
        tx.removeEventListener("complete", complete);
        tx.removeEventListener("error", error2);
        tx.removeEventListener("abort", error2);
      };
      const complete = () => {
        resolve();
        unlisten();
      };
      const error2 = () => {
        reject(tx.error || new DOMException("AbortError", "AbortError"));
        unlisten();
      };
      tx.addEventListener("complete", complete);
      tx.addEventListener("error", error2);
      tx.addEventListener("abort", error2);
    });
    transactionDoneMap.set(tx, done);
  }
  var idbProxyTraps = {
    get(target, prop, receiver) {
      if (target instanceof IDBTransaction) {
        if (prop === "done")
          return transactionDoneMap.get(target);
        if (prop === "store") {
          return receiver.objectStoreNames[1] ? void 0 : receiver.objectStore(receiver.objectStoreNames[0]);
        }
      }
      return wrap(target[prop]);
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
    has(target, prop) {
      if (target instanceof IDBTransaction && (prop === "done" || prop === "store")) {
        return true;
      }
      return prop in target;
    }
  };
  function replaceTraps(callback) {
    idbProxyTraps = callback(idbProxyTraps);
  }
  function wrapFunction(func) {
    if (getCursorAdvanceMethods().includes(func)) {
      return function(...args) {
        func.apply(unwrap(this), args);
        return wrap(this.request);
      };
    }
    return function(...args) {
      return wrap(func.apply(unwrap(this), args));
    };
  }
  function transformCachableValue(value) {
    if (typeof value === "function")
      return wrapFunction(value);
    if (value instanceof IDBTransaction)
      cacheDonePromiseForTransaction(value);
    if (instanceOfAny(value, getIdbProxyableTypes()))
      return new Proxy(value, idbProxyTraps);
    return value;
  }
  function wrap(value) {
    if (value instanceof IDBRequest)
      return promisifyRequest(value);
    if (transformCache.has(value))
      return transformCache.get(value);
    const newValue = transformCachableValue(value);
    if (newValue !== value) {
      transformCache.set(value, newValue);
      reverseTransformCache.set(newValue, value);
    }
    return newValue;
  }
  var unwrap = (value) => reverseTransformCache.get(value);
  function openDB(name, version, { blocked, upgrade, blocking, terminated } = {}) {
    const request = indexedDB.open(name, version);
    const openPromise = wrap(request);
    if (upgrade) {
      request.addEventListener("upgradeneeded", (event) => {
        upgrade(wrap(request.result), event.oldVersion, event.newVersion, wrap(request.transaction), event);
      });
    }
    if (blocked) {
      request.addEventListener("blocked", (event) => blocked(
        // Casting due to https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/1405
        event.oldVersion,
        event.newVersion,
        event
      ));
    }
    openPromise.then((db) => {
      if (terminated)
        db.addEventListener("close", () => terminated());
      if (blocking) {
        db.addEventListener("versionchange", (event) => blocking(event.oldVersion, event.newVersion, event));
      }
    }).catch(() => {
    });
    return openPromise;
  }
  function deleteDB(name, { blocked } = {}) {
    const request = indexedDB.deleteDatabase(name);
    if (blocked) {
      request.addEventListener("blocked", (event) => blocked(
        // Casting due to https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/1405
        event.oldVersion,
        event
      ));
    }
    return wrap(request).then(() => void 0);
  }
  var readMethods = ["get", "getKey", "getAll", "getAllKeys", "count"];
  var writeMethods = ["put", "add", "delete", "clear"];
  var cachedMethods = /* @__PURE__ */ new Map();
  function getMethod(target, prop) {
    if (!(target instanceof IDBDatabase && !(prop in target) && typeof prop === "string")) {
      return;
    }
    if (cachedMethods.get(prop))
      return cachedMethods.get(prop);
    const targetFuncName = prop.replace(/FromIndex$/, "");
    const useIndex = prop !== targetFuncName;
    const isWrite = writeMethods.includes(targetFuncName);
    if (
      // Bail if the target doesn't exist on the target. Eg, getAll isn't in Edge.
      !(targetFuncName in (useIndex ? IDBIndex : IDBObjectStore).prototype) || !(isWrite || readMethods.includes(targetFuncName))
    ) {
      return;
    }
    const method = async function(storeName, ...args) {
      const tx = this.transaction(storeName, isWrite ? "readwrite" : "readonly");
      let target2 = tx.store;
      if (useIndex)
        target2 = target2.index(args.shift());
      return (await Promise.all([
        target2[targetFuncName](...args),
        isWrite && tx.done
      ]))[0];
    };
    cachedMethods.set(prop, method);
    return method;
  }
  replaceTraps((oldTraps) => ({
    ...oldTraps,
    get: (target, prop, receiver) => getMethod(target, prop) || oldTraps.get(target, prop, receiver),
    has: (target, prop) => !!getMethod(target, prop) || oldTraps.has(target, prop)
  }));
  var advanceMethodProps = ["continue", "continuePrimaryKey", "advance"];
  var methodMap = {};
  var advanceResults = /* @__PURE__ */ new WeakMap();
  var ittrProxiedCursorToOriginalProxy = /* @__PURE__ */ new WeakMap();
  var cursorIteratorTraps = {
    get(target, prop) {
      if (!advanceMethodProps.includes(prop))
        return target[prop];
      let cachedFunc = methodMap[prop];
      if (!cachedFunc) {
        cachedFunc = methodMap[prop] = function(...args) {
          advanceResults.set(this, ittrProxiedCursorToOriginalProxy.get(this)[prop](...args));
        };
      }
      return cachedFunc;
    }
  };
  async function* iterate(...args) {
    let cursor = this;
    if (!(cursor instanceof IDBCursor)) {
      cursor = await cursor.openCursor(...args);
    }
    if (!cursor)
      return;
    cursor = cursor;
    const proxiedCursor = new Proxy(cursor, cursorIteratorTraps);
    ittrProxiedCursorToOriginalProxy.set(proxiedCursor, cursor);
    reverseTransformCache.set(proxiedCursor, unwrap(cursor));
    while (cursor) {
      yield proxiedCursor;
      cursor = await (advanceResults.get(proxiedCursor) || cursor.continue());
      advanceResults.delete(proxiedCursor);
    }
  }
  function isIteratorProp(target, prop) {
    return prop === Symbol.asyncIterator && instanceOfAny(target, [IDBIndex, IDBObjectStore, IDBCursor]) || prop === "iterate" && instanceOfAny(target, [IDBIndex, IDBObjectStore]);
  }
  replaceTraps((oldTraps) => ({
    ...oldTraps,
    get(target, prop, receiver) {
      if (isIteratorProp(target, prop))
        return iterate;
      return oldTraps.get(target, prop, receiver);
    },
    has(target, prop) {
      return isIteratorProp(target, prop) || oldTraps.has(target, prop);
    }
  }));

  // src/services/storage.ts
  var DB_NAME = "listening-stats";
  var DB_VERSION = 4;
  var STORE_NAME = "playEvents";
  var BACKUP_DB_NAME = "listening-stats-backup";
  var dbPromise = null;
  async function backupBeforeMigration() {
    let events = [];
    try {
      const currentDb = await openDB(DB_NAME);
      const version = currentDb.version;
      if (currentDb.objectStoreNames.contains(STORE_NAME)) {
        events = await currentDb.getAll(STORE_NAME);
      }
      currentDb.close();
      if (events.length === 0) {
        return events;
      }
      localStorage.setItem(LS_KEYS.MIGRATION_VERSION, String(version));
      try {
        const json = JSON.stringify(events);
        localStorage.setItem(LS_KEYS.MIGRATION_BACKUP, json);
        log(` Backed up ${events.length} events to localStorage`);
      } catch (e) {
        if (e?.name === "QuotaExceededError" || e?.code === 22) {
          warn(" localStorage full, using IndexedDB backup");
          localStorage.removeItem(LS_KEYS.MIGRATION_BACKUP);
          try {
            await deleteDB(BACKUP_DB_NAME);
          } catch {
          }
          const backupDb = await openDB(BACKUP_DB_NAME, 1, {
            upgrade(db) {
              db.createObjectStore("backup");
            }
          });
          await backupDb.put("backup", events, "events");
          backupDb.close();
          log(` Backed up ${events.length} events to IndexedDB`);
        } else {
          throw e;
        }
      }
    } catch (e) {
      error(" Backup failed:", e);
    }
    return events;
  }
  async function restoreFromBackup() {
    let events = null;
    try {
      const json = localStorage.getItem(LS_KEYS.MIGRATION_BACKUP);
      if (json) {
        events = JSON.parse(json);
      }
    } catch {
    }
    if (!events) {
      try {
        const backupDb = await openDB(BACKUP_DB_NAME, 1, {
          upgrade(db) {
            if (!db.objectStoreNames.contains("backup")) {
              db.createObjectStore("backup");
            }
          }
        });
        events = await backupDb.get("backup", "events");
        backupDb.close();
      } catch {
      }
    }
    if (events && events.length > 0) {
      try {
        const db = await openDB(DB_NAME);
        if (db.objectStoreNames.contains(STORE_NAME)) {
          const tx = db.transaction(STORE_NAME, "readwrite");
          await tx.store.clear();
          for (const event of events) {
            await tx.store.add(event);
          }
          await tx.done;
          log(` Restored ${events.length} events from backup`);
        }
        db.close();
      } catch (e) {
        error(" Restore failed:", e);
      }
    }
    await cleanupBackup();
  }
  async function cleanupBackup() {
    try {
      localStorage.removeItem(LS_KEYS.MIGRATION_BACKUP);
    } catch (e) {
      console.warn(
        "[listening-stats] Failed to remove migration backup from localStorage",
        e
      );
    }
    try {
      localStorage.removeItem(LS_KEYS.MIGRATION_VERSION);
    } catch (e) {
      console.warn(
        "[listening-stats] Failed to remove migration version from localStorage",
        e
      );
    }
    try {
      await deleteDB(BACKUP_DB_NAME);
    } catch {
    }
  }
  function resetDBPromise() {
    dbPromise = null;
  }
  async function getDB() {
    if (!dbPromise) {
      dbPromise = initDB();
    }
    try {
      const db = await dbPromise;
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        tx.abort();
        await tx.done.catch(() => {
        });
      } catch {
        log("IndexedDB connection stale, reconnecting...");
        dbPromise = initDB();
        return dbPromise;
      }
      return db;
    } catch {
      dbPromise = initDB();
      return dbPromise;
    }
  }
  async function initDB() {
    let needsBackup = false;
    let oldDbVersion = 0;
    try {
      const databases = await indexedDB.databases();
      const existing = databases.find((db) => db.name === DB_NAME);
      if (existing && existing.version) {
        oldDbVersion = existing.version;
        needsBackup = oldDbVersion < DB_VERSION;
      }
    } catch {
      try {
        const existingDb = await openDB(DB_NAME);
        oldDbVersion = existingDb.version;
        existingDb.close();
        needsBackup = oldDbVersion < DB_VERSION && oldDbVersion > 0;
      } catch {
        needsBackup = false;
      }
    }
    if (needsBackup) {
      await backupBeforeMigration();
    }
    try {
      const db = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db2, oldVersion, _newVersion, transaction) {
          if (!db2.objectStoreNames.contains(STORE_NAME)) {
            const store = db2.createObjectStore(STORE_NAME, {
              keyPath: "id",
              autoIncrement: true
            });
            store.createIndex("by-startedAt", "startedAt");
            store.createIndex("by-trackUri", "trackUri");
            store.createIndex("by-artistUri", "artistUri");
            store.createIndex("by-type", "type");
          } else {
            const store = transaction.objectStore(STORE_NAME);
            if (!store.indexNames.contains("by-startedAt")) {
              store.createIndex("by-startedAt", "startedAt");
            }
            if (!store.indexNames.contains("by-trackUri")) {
              store.createIndex("by-trackUri", "trackUri");
            }
            if (!store.indexNames.contains("by-artistUri")) {
              store.createIndex("by-artistUri", "artistUri");
            }
            if (!store.indexNames.contains("by-type")) {
              store.createIndex("by-type", "type");
            }
          }
        }
      });
      if (needsBackup) {
        await cleanupBackup();
        Spicetify?.showNotification?.("Database updated successfully");
        log(` Migration from v${oldDbVersion} to v${DB_VERSION} complete`);
      }
      const dedupDone = localStorage.getItem(LS_KEYS.DEDUP_V2_DONE);
      if (!dedupDone) {
        const dedupResult = await runDedup(db);
        if (dedupResult.removed > 0) {
          Spicetify?.showNotification?.(
            `Cleaned up ${dedupResult.removed} duplicate entries`
          );
        }
        localStorage.setItem(LS_KEYS.DEDUP_V2_DONE, "1");
      }
      return db;
    } catch (e) {
      error(" Migration failed, attempting rollback:", e);
      if (needsBackup) {
        await restoreFromBackup();
      }
      const fallbackDb = await openDB(DB_NAME);
      log(` Opened fallback DB at v${fallbackDb.version}`);
      return fallbackDb;
    }
  }
  async function runDedup(db) {
    try {
      const allEvents = await db.getAll(STORE_NAME);
      const byKey = /* @__PURE__ */ new Map();
      for (const event of allEvents) {
        const key = `${event.trackUri}:${event.startedAt}`;
        const existing = byKey.get(key);
        if (!existing || event.playedMs > existing.playedMs) {
          byKey.set(key, event);
        }
      }
      const keepIds = new Set(Array.from(byKey.values()).map((e) => e.id));
      const toDelete = allEvents.filter((e) => !keepIds.has(e.id));
      const affectedTracks = new Set(toDelete.map((e) => e.trackUri));
      if (toDelete.length > 0) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        for (const event of toDelete) {
          tx.store.delete(event.id);
        }
        await tx.done;
        log(
          ` Removed ${toDelete.length} duplicate events across ${affectedTracks.size} tracks`
        );
      }
      return { removed: toDelete.length, affectedTracks: affectedTracks.size };
    } catch (e) {
      error(" Dedup failed:", e);
      return { removed: 0, affectedTracks: 0 };
    }
  }
  async function addPlayEvent(event) {
    try {
      const db = await getDB();
      const range = IDBKeyRange.only(event.startedAt);
      const existing = await db.getAllFromIndex(
        STORE_NAME,
        "by-startedAt",
        range
      );
      if (existing.some((e) => e.trackUri === event.trackUri)) {
        warn(" Duplicate event blocked:", event.trackName);
        return false;
      }
      await db.add(STORE_NAME, event);
      return true;
    } catch (e) {
      warn(" addPlayEvent failed, resetting DB connection:", e);
      dbPromise = null;
      throw e;
    }
  }
  async function getPlayEventsByTimeRange(start, end) {
    const db = await getDB();
    const range = IDBKeyRange.bound(start.getTime(), end.getTime());
    return db.getAllFromIndex(STORE_NAME, "by-startedAt", range);
  }
  async function getAllPlayEvents() {
    const db = await getDB();
    return db.getAll(STORE_NAME);
  }
  async function clearAllData() {
    const db = await getDB();
    await db.clear(STORE_NAME);
    resetDBPromise();
    log("IndexedDB data cleared");
  }
  async function runTrackingTest() {
    try {
      const db = await getDB();
      const testEvent = {
        trackUri: "__ls_test__",
        trackName: "__test__",
        artistName: "__test__",
        artistUri: "__test__",
        albumName: "__test__",
        albumUri: "__test__",
        durationMs: 0,
        playedMs: 0,
        startedAt: Date.now(),
        endedAt: Date.now(),
        type: "play"
      };
      await db.add(STORE_NAME, testEvent);
      const testEntries = await db.getAllFromIndex(
        STORE_NAME,
        "by-trackUri",
        IDBKeyRange.only("__ls_test__")
      );
      if (testEntries.length > 0) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        for (const e of testEntries) {
          if (e.id) await tx.store.delete(e.id);
        }
        await tx.done;
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }
  async function startupIntegrityCheck() {
    try {
      const db = await getDB();
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        return { ok: false, error: "Object store missing" };
      }
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.store;
      const requiredIndexes = ["by-startedAt", "by-trackUri", "by-artistUri", "by-type"];
      for (const idx of requiredIndexes) {
        if (!store.indexNames.contains(idx)) {
          tx.abort();
          return { ok: false, error: `Index missing: ${idx}` };
        }
      }
      await tx.done.catch(() => {
      });
      return runTrackingTest();
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  // src/services/tracker.ts
  var DEFAULT_THRESHOLD_MS = 1e4;
  var activeProviderType = null;
  var _trackingStatus = {
    healthy: true,
    lastSuccessfulWriteAt: null,
    lastSuccessfulTrackName: null,
    lastError: null
  };
  var _trackingFailureNotified = false;
  function getTrackingStatus() {
    return { ..._trackingStatus };
  }
  function setTrackingHealthy(healthy, error2) {
    _trackingStatus.healthy = healthy;
    if (error2 !== void 0) _trackingStatus.lastError = error2;
    else if (healthy) _trackingStatus.lastError = null;
  }
  var _warnedKeys = /* @__PURE__ */ new Set();
  function warnOnce(key, msg, err) {
    if (_warnedKeys.has(key)) return;
    _warnedKeys.add(key);
    console.warn(`[listening-stats] ${msg}`, err ?? "");
  }
  function isTrackingPaused() {
    try {
      return localStorage.getItem(LS_KEYS.TRACKING_PAUSED) === "1";
    } catch (e) {
      warnOnce("trackingPaused", "Failed to read trackingPaused", e);
      return false;
    }
  }
  function isSkipRepeatsEnabled() {
    try {
      return localStorage.getItem(LS_KEYS.SKIP_REPEATS) === "1";
    } catch (e) {
      warnOnce("skipRepeats", "Failed to read skipRepeats", e);
      return false;
    }
  }
  function getPlayThreshold() {
    try {
      const stored = localStorage.getItem(LS_KEYS.PLAY_THRESHOLD);
      if (stored) {
        const val = parseInt(stored, 10);
        if (val >= 0 && val <= 6e4) return val;
      }
    } catch (e) {
      warnOnce("threshold", "Failed to read play threshold", e);
    }
    return DEFAULT_THRESHOLD_MS;
  }
  function emitStatsUpdated() {
    window.dispatchEvent(new CustomEvent(EVENTS.STATS_UPDATED));
    localStorage.setItem(LS_KEYS.LAST_UPDATE, Date.now().toString());
  }
  function defaultPollingData() {
    return {
      hourlyDistribution: new Array(24).fill(0),
      activityDates: [],
      knownArtistUris: [],
      skipEvents: 0,
      totalPlays: 0,
      lastPollTimestamp: 0,
      trackPlayCounts: {},
      artistPlayCounts: {},
      seeded: false
    };
  }
  function getPollingData() {
    try {
      const stored = localStorage.getItem(LS_KEYS.POLLING_DATA);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed.hourlyDistribution) || parsed.hourlyDistribution.length !== 24) {
          parsed.hourlyDistribution = new Array(24).fill(0);
        }
        if (!parsed.trackPlayCounts) parsed.trackPlayCounts = {};
        if (!parsed.artistPlayCounts) parsed.artistPlayCounts = {};
        if (parsed.seeded === void 0) parsed.seeded = false;
        return parsed;
      }
    } catch (error2) {
      warn(" Failed to load polling data:", error2);
    }
    return defaultPollingData();
  }
  function savePollingData(data) {
    try {
      if (data.activityDates.length > 400) {
        data.activityDates = data.activityDates.slice(-365);
      }
      if (data.knownArtistUris.length > 5e3) {
        data.knownArtistUris = data.knownArtistUris.slice(-5e3);
      }
      const trackEntries = Object.entries(data.trackPlayCounts);
      if (trackEntries.length > 2e3) {
        const sorted = trackEntries.sort((a, b) => b[1] - a[1]).slice(0, 2e3);
        data.trackPlayCounts = Object.fromEntries(sorted);
      }
      const artistEntries = Object.entries(data.artistPlayCounts);
      if (artistEntries.length > 1e3) {
        const sorted = artistEntries.sort((a, b) => b[1] - a[1]).slice(0, 1e3);
        data.artistPlayCounts = Object.fromEntries(sorted);
      }
      localStorage.setItem(LS_KEYS.POLLING_DATA, JSON.stringify(data));
    } catch (error2) {
      warn(" Failed to save polling data:", error2);
    }
  }
  var currentTrackUri = null;
  var playStartTime = null;
  var accumulatedPlayTime = 0;
  var isPlaying = false;
  var currentTrackDuration = 0;
  var lastProgressMs = 0;
  var progressHandler = null;
  var lastWrittenUri = null;
  var lastWrittenAt = 0;
  var lastRecordedUri = null;
  var DEDUP_WINDOW_MS = 500;
  async function handleSongChange() {
    if (currentTrackUri && playStartTime !== null) {
      const totalPlayedMs = accumulatedPlayTime + (isPlaying ? Date.now() - playStartTime : 0);
      const threshold = getPlayThreshold();
      const skipped = totalPlayedMs < threshold && currentTrackDuration > threshold;
      if (previousTrackData) {
        log(
          skipped ? "Skipped:" : "Tracked:",
          `${previousTrackData.artistName} - ${previousTrackData.trackName}`,
          `(${Math.round(totalPlayedMs / 1e3)}s / ${Math.round(currentTrackDuration / 1e3)}s)`
        );
      }
      await writePlayEvent(totalPlayedMs, skipped);
    }
    const playerData = Spicetify.Player.data;
    if (playerData?.item) {
      currentTrackUri = playerData.item.uri;
      currentTrackDuration = playerData.item.duration?.milliseconds || Spicetify.Player.getDuration() || 0;
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
  var previousTrackData = null;
  function captureCurrentTrackData() {
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
      durationMs: playerData.item.duration?.milliseconds || Spicetify.Player.getDuration() || 0,
      startedAt: Date.now()
    };
  }
  async function writePlayEvent(totalPlayedMs, skipped) {
    if (!previousTrackData) return;
    if (isTrackingPaused()) {
      log("Tracking paused: skipping write for:", previousTrackData.trackName);
      return;
    }
    if (isSkipRepeatsEnabled() && previousTrackData.trackUri === lastRecordedUri) {
      log(
        "Skip-repeats: suppressed consecutive play for:",
        previousTrackData.trackName
      );
      return;
    }
    const now = Date.now();
    if (previousTrackData.trackUri === lastWrittenUri && now - lastWrittenAt < DEDUP_WINDOW_MS) {
      log(
        "Dedup: suppressed duplicate write for",
        previousTrackData.trackName,
        `(${now - lastWrittenAt}ms since last write)`
      );
      return;
    }
    if (skipped === void 0) {
      const threshold = getPlayThreshold();
      skipped = totalPlayedMs < threshold && previousTrackData.durationMs > threshold;
    }
    const event = {
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
      type: skipped ? "skip" : "play"
    };
    try {
      const written = await addPlayEvent(event);
      if (written) {
        lastWrittenUri = previousTrackData.trackUri;
        lastWrittenAt = Date.now();
        _trackingStatus.healthy = true;
        _trackingStatus.lastSuccessfulWriteAt = Date.now();
        _trackingStatus.lastSuccessfulTrackName = previousTrackData.trackName;
        _trackingStatus.lastError = null;
        _trackingFailureNotified = false;
        if (!skipped && isSkipRepeatsEnabled()) {
          lastRecordedUri = previousTrackData.trackUri;
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
          true
        );
      }
    }
  }
  function handlePlayPause() {
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
  function handleProgress() {
    const progress = Spicetify.Player.getProgress();
    const duration = Spicetify.Player.getDuration();
    const repeat = Spicetify.Player.getRepeat();
    if (repeat === 2 && duration > 0) {
      const wasNearEnd = lastProgressMs > duration * 0.9;
      const nowNearStart = progress < duration * 0.1;
      if (wasNearEnd && nowNearStart && currentTrackUri) {
        log("Repeat-one loop detected, recording play");
        handleSongChange();
        captureCurrentTrackData();
      }
    }
    lastProgressMs = progress;
  }
  var pollIntervalId = null;
  var activeSongChangeHandler = null;
  var _visibilityHandler = null;
  function initPoller(providerType) {
    const win = window;
    if (win.__lsPollerInitialized) return;
    win.__lsPollerInitialized = true;
    activeProviderType = providerType;
    captureCurrentTrackData();
    activeSongChangeHandler = () => {
      lastProgressMs = 0;
      handleSongChange().catch((e) => {
        warn("songchange handler error:", e);
      });
      captureCurrentTrackData();
    };
    Spicetify.Player.addEventListener("songchange", activeSongChangeHandler);
    Spicetify.Player.addEventListener("onplaypause", handlePlayPause);
    progressHandler = handleProgress;
    Spicetify.Player.addEventListener("onprogress", progressHandler);
    win.__lsSongHandler = activeSongChangeHandler;
    win.__lsPauseHandler = handlePlayPause;
    win.__lsProgressHandler = progressHandler;
    const playerData = Spicetify.Player.data;
    if (playerData?.item) {
      currentTrackUri = playerData.item.uri;
      currentTrackDuration = playerData.item.duration?.milliseconds || Spicetify.Player.getDuration() || 0;
      playStartTime = Date.now();
      isPlaying = !playerData.isPaused;
    }
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
    }, 3e5);
    if (_visibilityHandler) {
      document.removeEventListener("visibilitychange", _visibilityHandler);
    }
    _visibilityHandler = () => {
      if (document.visibilityState !== "visible") return;
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
      getDB().catch(() => {
        warn("Visibility restored: DB ping failed, connection will reconnect on next write");
      });
    };
    document.addEventListener("visibilitychange", _visibilityHandler);
  }
  function destroyPoller() {
  }

  // src/utils/streak.ts
  function calculateStreak(activityDates) {
    const dateSet = new Set(activityDates);
    const today = /* @__PURE__ */ new Date();
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().split("T")[0];
      if (dateSet.has(key)) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }
    return streak;
  }

  // src/services/providers/lastfm.ts
  var PERIODS = [
    "recent",
    "7day",
    "1month",
    "3month",
    "6month",
    "12month",
    "overall"
  ];
  var PERIOD_LABELS = {
    recent: "Recent",
    "7day": "7 Days",
    "1month": "1 Month",
    "3month": "3 Months",
    "6month": "6 Months",
    "12month": "12 Months",
    overall: "Overall"
  };
  function createLastfmProvider() {
    return {
      type: "lastfm",
      periods: [...PERIODS],
      periodLabels: PERIOD_LABELS,
      defaultPeriod: "recent",
      init() {
        initPoller("lastfm");
      },
      destroy() {
        destroyPoller();
      },
      async calculateStats(period) {
        if (period === "recent") {
          return calculateRecentStats();
        }
        return calculateRankedStats(period);
      }
    };
  }
  async function calculateRecentStats() {
    const [recentLfm, userInfo] = await Promise.all([
      getRecentTracks(50),
      getUserInfo().catch(() => null)
    ]);
    const pollingData = getPollingData();
    const recentTracks = recentLfm.filter((t) => !t.nowPlaying).map((t) => ({
      trackUri: "",
      trackName: t.name,
      artistName: t.artist,
      artistUri: "",
      albumName: t.album,
      albumUri: "",
      albumArt: t.albumArt,
      durationMs: 0,
      playedAt: t.playedAt
    }));
    const trackMap = /* @__PURE__ */ new Map();
    for (const t of recentTracks) {
      const key = `${t.artistName}|||${t.trackName}`;
      const existing = trackMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        trackMap.set(key, {
          trackName: t.trackName,
          artistName: t.artistName,
          albumArt: t.albumArt,
          count: 1
        });
      }
    }
    const topTracks = Array.from(trackMap.values()).sort((a, b) => b.count - a.count).slice(0, 10).map((t, i) => ({
      trackUri: "",
      trackName: t.trackName,
      artistName: t.artistName,
      albumArt: t.albumArt,
      rank: i + 1,
      totalTimeMs: 0,
      playCount: t.count
    }));
    const artistMap = /* @__PURE__ */ new Map();
    for (const t of recentTracks) {
      const existing = artistMap.get(t.artistName);
      if (existing) {
        existing.count++;
      } else {
        artistMap.set(t.artistName, { artistName: t.artistName, count: 1 });
      }
    }
    const topArtists = Array.from(artistMap.values()).sort((a, b) => b.count - a.count).slice(0, 10).map((a, i) => ({
      artistUri: "",
      artistName: a.artistName,
      artistImage: void 0,
      rank: i + 1,
      genres: [],
      playCount: a.count
    }));
    const albumMap = /* @__PURE__ */ new Map();
    for (const t of recentTracks) {
      if (!t.albumName) continue;
      const key = `${t.artistName}|||${t.albumName}`;
      const existing = albumMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        albumMap.set(key, {
          albumName: t.albumName,
          artistName: t.artistName,
          albumArt: t.albumArt,
          count: 1
        });
      }
    }
    const topAlbums = Array.from(albumMap.values()).sort((a, b) => b.count - a.count).slice(0, 10).map((a) => ({
      albumUri: "",
      albumName: a.albumName,
      artistName: a.artistName,
      albumArt: a.albumArt,
      trackCount: a.count,
      playCount: a.count
    }));
    const hourlyDistribution = new Array(24).fill(0);
    for (const t of recentTracks) {
      const hour = new Date(t.playedAt).getHours();
      hourlyDistribution[hour]++;
    }
    const uniqueTrackNames = new Set(
      recentTracks.map((t) => `${t.artistName}|||${t.trackName}`)
    );
    const uniqueArtistNames = new Set(recentTracks.map((t) => t.artistName));
    let estimatedTimeMs = 0;
    const sorted = [...recentTracks].sort(
      (a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime()
    );
    const SESSION_GAP_MS = 6 * 60 * 1e3;
    const AVG_TRACK_MS = 21e4;
    for (let i = 0; i < sorted.length; i++) {
      if (i < sorted.length - 1) {
        const gap = new Date(sorted[i + 1].playedAt).getTime() - new Date(sorted[i].playedAt).getTime();
        estimatedTimeMs += gap > 0 && gap <= SESSION_GAP_MS ? gap : AVG_TRACK_MS;
      } else {
        estimatedTimeMs += AVG_TRACK_MS;
      }
    }
    const activityDates = [
      ...new Set(
        recentTracks.map((t) => new Date(t.playedAt).toISOString().split("T")[0])
      )
    ];
    return {
      totalTimeMs: estimatedTimeMs,
      trackCount: recentTracks.length,
      uniqueTrackCount: uniqueTrackNames.size,
      uniqueArtistCount: uniqueArtistNames.size,
      topTracks,
      topArtists,
      topAlbums,
      hourlyDistribution,
      hourlyUnit: "plays",
      peakHour: hourlyDistribution.indexOf(Math.max(...hourlyDistribution)),
      recentTracks,
      genres: {},
      topGenres: [],
      streakDays: calculateStreak(activityDates),
      newArtistsCount: 0,
      skipRate: pollingData.totalPlays > 0 ? pollingData.skipEvents / pollingData.totalPlays : 0,
      listenedDays: activityDates.length,
      lastfmConnected: true,
      totalScrobbles: userInfo?.totalScrobbles
    };
  }
  async function calculateRankedStats(period) {
    const [
      lfmTracksResult,
      lfmArtistsResult,
      lfmAlbumsResult,
      recentLfm,
      userInfo
    ] = await Promise.all([
      getTopTracks(period, 50),
      getTopArtists(period, 50),
      getTopAlbums(period, 50),
      getRecentTracks(50).catch(() => []),
      getUserInfo().catch(() => null)
    ]);
    const lfmTracks = lfmTracksResult.tracks;
    const lfmArtists = lfmArtistsResult.artists;
    const lfmAlbums = lfmAlbumsResult.albums;
    const pollingData = getPollingData();
    const topTracks = lfmTracks.slice(0, 10).map((t, i) => ({
      trackUri: "",
      trackName: t.name,
      artistName: t.artist,
      albumArt: t.imageUrl,
      rank: i + 1,
      totalTimeMs: (t.durationSecs || 0) * 1e3,
      playCount: t.playCount
    }));
    const topArtists = lfmArtists.slice(0, 10).map((a, i) => ({
      artistUri: "",
      artistName: a.name,
      artistImage: a.imageUrl,
      rank: i + 1,
      genres: [],
      playCount: a.playCount
    }));
    const topAlbums = lfmAlbums.slice(0, 10).map((a) => ({
      albumUri: "",
      albumName: a.name,
      artistName: a.artist,
      albumArt: a.imageUrl,
      trackCount: 0,
      playCount: a.playCount
    }));
    const recentTracks = (Array.isArray(recentLfm) ? recentLfm : []).filter((t) => !t.nowPlaying).map((t) => ({
      trackUri: "",
      trackName: t.name,
      artistName: t.artist,
      artistUri: "",
      albumName: t.album,
      albumUri: "",
      albumArt: t.albumArt,
      durationMs: 0,
      playedAt: t.playedAt
    }));
    const hourlyDistribution = new Array(24).fill(0);
    for (const t of recentTracks) {
      const hour = new Date(t.playedAt).getHours();
      hourlyDistribution[hour]++;
    }
    const totalPlays = lfmTracks.reduce((sum, t) => sum + t.playCount, 0);
    const totalTimeMs = lfmTracks.reduce(
      (sum, t) => sum + (t.durationSecs || 210) * 1e3 * t.playCount,
      0
    );
    const activityDates = [
      ...new Set(
        recentTracks.map((t) => new Date(t.playedAt).toISOString().split("T")[0])
      )
    ];
    return {
      totalTimeMs,
      trackCount: totalPlays,
      uniqueTrackCount: lfmTracksResult.total,
      uniqueArtistCount: lfmArtistsResult.total,
      topTracks,
      topArtists,
      topAlbums,
      hourlyDistribution,
      hourlyUnit: "plays",
      peakHour: hourlyDistribution.indexOf(Math.max(...hourlyDistribution)),
      recentTracks,
      genres: {},
      topGenres: [],
      streakDays: calculateStreak(activityDates),
      newArtistsCount: 0,
      skipRate: pollingData.totalPlays > 0 ? pollingData.skipEvents / pollingData.totalPlays : 0,
      listenedDays: activityDates.length,
      lastfmConnected: true,
      totalScrobbles: userInfo?.totalScrobbles
    };
  }

  // src/services/api-resilience.ts
  var ApiError = class extends Error {
    constructor(message, statusCode, retryable = false) {
      super(message);
      this.statusCode = statusCode;
      this.retryable = retryable;
      this.name = "ApiError";
    }
  };
  var CircuitBreaker = class {
    constructor(failureThreshold = 5, resetTimeoutMs = 6e4) {
      this.failureThreshold = failureThreshold;
      this.resetTimeoutMs = resetTimeoutMs;
      this.state = "closed";
      this.failures = 0;
      this.lastFailure = 0;
    }
    async execute(fn) {
      if (this.state === "open") {
        if (Date.now() - this.lastFailure >= this.resetTimeoutMs) {
          this.state = "half_open";
        } else {
          throw new ApiError(
            "Circuit open: API temporarily unavailable",
            void 0,
            true
          );
        }
      }
      try {
        const result = await fn();
        this.onSuccess();
        return result;
      } catch (error2) {
        this.onFailure();
        throw error2;
      }
    }
    reset() {
      this.failures = 0;
      this.state = "closed";
    }
    onSuccess() {
      this.failures = 0;
      this.state = "closed";
    }
    onFailure() {
      this.failures++;
      this.lastFailure = Date.now();
      if (this.failures >= this.failureThreshold) {
        this.state = "open";
      }
    }
  };
  function createBatchCoalescer(batchFn, windowMs = 50, maxBatch = 50) {
    let pending = /* @__PURE__ */ new Map();
    let timer = null;
    function flush() {
      timer = null;
      const batch = pending;
      pending = /* @__PURE__ */ new Map();
      const keys = [...batch.keys()];
      batchFn(keys).then((results) => {
        for (const [key, entries] of batch) {
          const val = results.get(key);
          for (const entry of entries) {
            entry.resolve(val);
          }
        }
      }).catch((err) => {
        for (const entries of batch.values()) {
          for (const entry of entries) {
            entry.reject(err);
          }
        }
      });
    }
    return function request(key) {
      return new Promise((resolve, reject) => {
        const entries = pending.get(key) || [];
        entries.push({ resolve, reject });
        pending.set(key, entries);
        if (pending.size >= maxBatch) {
          if (timer) clearTimeout(timer);
          flush();
        } else if (!timer) {
          timer = setTimeout(flush, windowMs);
        }
      });
    };
  }

  // src/services/spotify-api.ts
  var QUEUE_DELAY_MS = 300;
  var MAX_BATCH = 50;
  var CACHE_TTL_MS2 = 3e5;
  var DEFAULT_BACKOFF_MS = 6e4;
  var MAX_BACKOFF_MS = 6e5;
  var rateLimitedUntil = 0;
  try {
    const stored = localStorage.getItem(`${LS_KEYS.STORAGE_PREFIX}rateLimitedUntil`);
    if (stored) {
      const val = parseInt(stored, 10);
      rateLimitedUntil = Date.now() >= val ? 0 : val;
      if (rateLimitedUntil === 0) {
        localStorage.removeItem(`${LS_KEYS.STORAGE_PREFIX}rateLimitedUntil`);
      }
    }
  } catch (e) {
    console.warn("[listening-stats] API cache read failed", e);
  }
  function isApiAvailable() {
    return Date.now() >= rateLimitedUntil;
  }
  function setRateLimit(error2) {
    let backoffMs = DEFAULT_BACKOFF_MS;
    const retryAfterRaw = error2?.headers?.["retry-after"] ?? error2?.body?.["Retry-After"] ?? error2?.headers?.["Retry-After"];
    if (retryAfterRaw != null) {
      const parsed = parseInt(String(retryAfterRaw), 10);
      if (!isNaN(parsed) && parsed > 0) {
        backoffMs = Math.min(parsed * 1e3, MAX_BACKOFF_MS);
      }
    }
    rateLimitedUntil = Date.now() + backoffMs;
    localStorage.setItem(
      `${LS_KEYS.STORAGE_PREFIX}rateLimitedUntil`,
      rateLimitedUntil.toString()
    );
  }
  var cache2 = /* @__PURE__ */ new Map();
  function getCached2(key) {
    const entry = cache2.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      cache2.delete(key);
      return null;
    }
    return entry.data;
  }
  function setCache2(key, data) {
    cache2.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS2 });
  }
  var PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };
  var queue = [];
  var draining = false;
  var inflight = /* @__PURE__ */ new Map();
  var circuitBreaker = new CircuitBreaker(5, 6e4);
  function enqueueWithPriority(key, fn, priority = "normal") {
    const existing = inflight.get(key);
    if (existing) return existing;
    const promise = new Promise((resolve, reject) => {
      queue.push({ key, fn, resolve, reject, priority });
      queue.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
      if (!draining) drainQueue();
    });
    inflight.set(key, promise);
    promise.finally(() => inflight.delete(key));
    return promise;
  }
  async function drainQueue() {
    draining = true;
    while (queue.length > 0) {
      if (!isApiAvailable()) {
        const waitMs = rateLimitedUntil - Date.now();
        await new Promise((r) => setTimeout(r, waitMs));
      }
      const item = queue.shift();
      try {
        const result = await circuitBreaker.execute(() => item.fn());
        item.resolve(result);
      } catch (error2) {
        if (error2?.message?.includes("429") || error2?.status === 429 || error2?.statusCode === 429) {
          setRateLimit(error2);
        }
        item.reject(error2);
      }
      if (queue.length > 0) {
        await new Promise((r) => setTimeout(r, QUEUE_DELAY_MS));
      }
    }
    draining = false;
  }
  async function apiFetch(url) {
    const cached = getCached2(url);
    if (cached) return cached;
    return enqueueWithPriority(url, async () => {
      let response;
      try {
        response = await Spicetify.CosmosAsync.get(url);
      } catch (err) {
        if (err?.status === 429 || String(err?.message || "").includes("429")) {
          setRateLimit(err);
          throw new ApiError(
            err?.message || "Rate limited",
            429,
            true
          );
        }
        const status = err?.status;
        throw new ApiError(
          err?.message || "API request failed",
          status,
          status !== void 0 && (status === 429 || status >= 500)
        );
      }
      if (!response) {
        throw new ApiError("Empty API response", void 0, false);
      }
      if (response.error) {
        const status = response.error.status;
        const message = response.error.message || `Spotify API error ${status}`;
        if (status === 429) setRateLimit(response);
        throw new ApiError(message, status, status === 429 || status >= 500);
      }
      setCache2(url, response);
      return response;
    });
  }
  var searchCache = /* @__PURE__ */ new Map();
  try {
    const stored = localStorage.getItem(LS_KEYS.SEARCH_CACHE);
    if (stored) {
      const parsed = JSON.parse(stored);
      for (const [k, v] of Object.entries(parsed)) {
        searchCache.set(k, v);
      }
    }
  } catch (e) {
    console.warn("[listening-stats] Search cache read failed", e);
  }
  async function getArtistsBatch(artistIds) {
    const unique = [...new Set(artistIds)].filter(Boolean);
    if (unique.length === 0) return [];
    const results = [];
    for (let i = 0; i < unique.length; i += MAX_BATCH) {
      const chunk = unique.slice(i, i + MAX_BATCH);
      const ids = chunk.join(",");
      try {
        const response = await apiFetch(
          `https://api.spotify.com/v1/artists?ids=${ids}`
        );
        if (response?.artists) {
          results.push(...response.artists.filter(Boolean));
        }
      } catch (error2) {
        warn(" Artist batch fetch failed:", error2);
      }
    }
    return results;
  }
  var artistCoalescer = createBatchCoalescer(
    async (ids) => {
      const results = /* @__PURE__ */ new Map();
      for (let i = 0; i < ids.length; i += MAX_BATCH) {
        const chunk = ids.slice(i, i + MAX_BATCH);
        try {
          const response = await apiFetch(
            `https://api.spotify.com/v1/artists?ids=${chunk.join(",")}`
          );
          if (response?.artists) {
            for (const artist of response.artists.filter(Boolean)) {
              if (artist.id) results.set(artist.id, artist);
            }
          }
        } catch (error2) {
          warn(" Artist batch fetch failed:", error2);
        }
      }
      return results;
    },
    50,
    MAX_BATCH
  );

  // src/services/providers/local.ts
  var PERIODS2 = ["today", "this_week", "this_month", "all_time"];
  var PERIOD_LABELS2 = {
    today: "Today",
    this_week: "This Week",
    this_month: "This Month",
    all_time: "All Time"
  };
  function createLocalProvider() {
    return {
      type: "local",
      periods: [...PERIODS2],
      periodLabels: PERIOD_LABELS2,
      defaultPeriod: "today",
      init() {
        resetDBPromise();
      },
      destroy() {
        resetDBPromise();
      },
      async calculateStats(period) {
        const events = await getEventsForPeriod(period);
        const allEvents = period === "all_time" ? events : await getAllPlayEvents();
        return aggregateEvents(events, allEvents);
      },
      clearData() {
        clearAllData();
      }
    };
  }
  function getTimeRange(period) {
    const now = /* @__PURE__ */ new Date();
    const end = now;
    let start;
    switch (period) {
      case "today": {
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
        break;
      }
      case "this_week": {
        start = new Date(now);
        start.setDate(now.getDate() - now.getDay());
        start.setHours(0, 0, 0, 0);
        break;
      }
      case "this_month": {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      }
      default:
        start = /* @__PURE__ */ new Date(0);
        break;
    }
    return { start, end };
  }
  async function getEventsForPeriod(period) {
    if (period === "all_time") {
      return getAllPlayEvents();
    }
    const { start, end } = getTimeRange(period);
    return getPlayEventsByTimeRange(start, end);
  }
  async function aggregateEvents(events, allEvents) {
    const completedEvents = events.filter((e) => e.type !== "skip");
    const trackMap = /* @__PURE__ */ new Map();
    for (const e of completedEvents) {
      const existing = trackMap.get(e.trackUri);
      if (existing) {
        existing.count++;
        existing.totalMs += e.playedMs;
        if (e.startedAt > existing.lastPlayedAt)
          existing.lastPlayedAt = e.startedAt;
      } else {
        trackMap.set(e.trackUri, {
          trackUri: e.trackUri,
          trackName: e.trackName,
          artistName: e.artistName,
          albumArt: e.albumArt,
          count: 1,
          totalMs: e.playedMs,
          lastPlayedAt: e.startedAt
        });
      }
    }
    const topTracks = Array.from(trackMap.values()).sort((a, b) => {
      if (b.totalMs !== a.totalMs) return b.totalMs - a.totalMs;
      if (b.count !== a.count) return b.count - a.count;
      if (b.lastPlayedAt !== a.lastPlayedAt)
        return b.lastPlayedAt - a.lastPlayedAt;
      return a.trackUri.localeCompare(b.trackUri);
    }).slice(0, 10).map((t, i) => ({
      trackUri: t.trackUri,
      trackName: t.trackName,
      artistName: t.artistName,
      albumArt: t.albumArt,
      rank: i + 1,
      totalTimeMs: t.totalMs,
      playCount: t.count
    }));
    const artistMap = /* @__PURE__ */ new Map();
    for (const e of completedEvents) {
      const key = e.artistUri || e.artistName;
      const existing = artistMap.get(key);
      if (existing) {
        existing.count++;
        existing.totalMs += e.playedMs;
        if (e.startedAt > existing.lastPlayedAt)
          existing.lastPlayedAt = e.startedAt;
      } else {
        artistMap.set(key, {
          artistUri: e.artistUri,
          artistName: e.artistName,
          count: 1,
          totalMs: e.playedMs,
          lastPlayedAt: e.startedAt
        });
      }
    }
    const topArtistAggregated = Array.from(artistMap.values()).sort((a, b) => {
      if (b.totalMs !== a.totalMs) return b.totalMs - a.totalMs;
      if (b.count !== a.count) return b.count - a.count;
      if (b.lastPlayedAt !== a.lastPlayedAt)
        return b.lastPlayedAt - a.lastPlayedAt;
      const aKey = a.artistUri || a.artistName;
      const bKey = b.artistUri || b.artistName;
      return aKey.localeCompare(bKey);
    }).slice(0, 10);
    const topArtists = topArtistAggregated.map((a, i) => ({
      artistUri: a.artistUri,
      artistName: a.artistName,
      artistImage: void 0,
      rank: i + 1,
      genres: [],
      playCount: a.count
    }));
    const artistIds = topArtists.map((a) => Spicetify.URI.from(a.artistUri)?.id).filter((id) => !!id);
    if (artistIds.length > 0) {
      try {
        const artists = await getArtistsBatch(artistIds);
        const imageMap = /* @__PURE__ */ new Map();
        for (const artist of artists) {
          if (artist.id && artist.images?.[0]?.url) {
            imageMap.set(artist.id, artist.images[0].url);
          }
        }
        for (const a of topArtists) {
          const id = Spicetify.URI.from(a.artistUri)?.id;
          if (id && imageMap.has(id)) {
            a.artistImage = imageMap.get(id);
          }
        }
      } catch (e) {
        console.warn("[listening-stats] Artist enrichment failed:", e);
      }
    }
    const albumMap = /* @__PURE__ */ new Map();
    for (const e of completedEvents) {
      const existing = albumMap.get(e.albumUri);
      if (existing) {
        existing.trackCount++;
        existing.totalMs += e.playedMs;
        if (e.startedAt > existing.lastPlayedAt)
          existing.lastPlayedAt = e.startedAt;
      } else {
        albumMap.set(e.albumUri, {
          albumUri: e.albumUri,
          albumName: e.albumName || "Unknown Album",
          artistName: e.artistName,
          albumArt: e.albumArt,
          trackCount: 1,
          totalMs: e.playedMs,
          lastPlayedAt: e.startedAt
        });
      }
    }
    const topAlbums = Array.from(albumMap.values()).sort((a, b) => {
      if (b.totalMs !== a.totalMs) return b.totalMs - a.totalMs;
      if (b.trackCount !== a.trackCount) return b.trackCount - a.trackCount;
      if (b.lastPlayedAt !== a.lastPlayedAt)
        return b.lastPlayedAt - a.lastPlayedAt;
      return a.albumUri.localeCompare(b.albumUri);
    }).slice(0, 10).map((a) => ({
      ...a,
      playCount: a.trackCount
    }));
    const hourlyDistribution = new Array(24).fill(0);
    for (const e of events) {
      const hour = new Date(e.startedAt).getHours();
      hourlyDistribution[hour] += e.playedMs;
    }
    const genreMap = /* @__PURE__ */ new Map();
    for (const a of topArtists) {
      for (const genre of a.genres) {
        genreMap.set(genre, (genreMap.get(genre) || 0) + 1);
      }
    }
    const genres = {};
    for (const [g, c] of genreMap) genres[g] = c;
    const topGenres = Array.from(genreMap.entries()).map(([genre, count]) => ({ genre, count })).sort((a, b) => b.count - a.count).slice(0, 10);
    const recent = events.sort((a, b) => b.startedAt - a.startedAt).slice(0, 50);
    const recentTracks = recent.map((e) => ({
      trackUri: e.trackUri,
      trackName: e.trackName,
      artistName: e.artistName,
      artistUri: e.artistUri,
      albumName: e.albumName || "Unknown Album",
      albumUri: e.albumUri,
      albumArt: e.albumArt,
      durationMs: e.durationMs,
      playedAt: new Date(e.startedAt).toISOString()
    }));
    const uniqueTrackUris = new Set(completedEvents.map((e) => e.trackUri));
    const uniqueArtistUris = new Set(
      completedEvents.map((e) => e.artistUri).filter(Boolean)
    );
    const periodDates = new Set(
      events.map((e) => new Date(e.startedAt).toISOString().split("T")[0])
    );
    const allDates = Array.from(
      new Set(
        allEvents.map((e) => new Date(e.startedAt).toISOString().split("T")[0])
      )
    );
    const totalTimeMs = events.reduce((sum, e) => sum + e.playedMs, 0);
    const skipEvents = events.length - completedEvents.length;
    return {
      totalTimeMs,
      trackCount: events.length,
      uniqueTrackCount: uniqueTrackUris.size,
      uniqueArtistCount: uniqueArtistUris.size,
      topTracks,
      topArtists,
      topAlbums,
      hourlyDistribution,
      peakHour: hourlyDistribution.indexOf(Math.max(...hourlyDistribution)),
      recentTracks,
      genres,
      topGenres,
      streakDays: calculateStreak(allDates),
      newArtistsCount: 0,
      skipRate: events.length > 0 ? skipEvents / events.length : 0,
      listenedDays: periodDates.size,
      lastfmConnected: false
    };
  }

  // src/services/statsfm.ts
  var API_BASE = "https://api.stats.fm/api/v1";
  var CACHE_TTL_MS3 = 12e4;
  var configCache2 = void 0;
  function getConfig2() {
    if (configCache2 !== void 0) return configCache2;
    try {
      const stored = localStorage.getItem(LS_KEYS.STATSFM_CONFIG);
      if (stored) {
        configCache2 = JSON.parse(stored);
        return configCache2;
      }
    } catch (e) {
      console.warn("[listening-stats] stats.fm config read failed", e);
    }
    configCache2 = null;
    return null;
  }
  function saveConfig(config) {
    configCache2 = config;
    localStorage.setItem(LS_KEYS.STATSFM_CONFIG, JSON.stringify(config));
  }
  var cache3 = /* @__PURE__ */ new Map();
  function getCached3(key) {
    const entry = cache3.get(key);
    if (!entry || Date.now() >= entry.expiresAt) {
      cache3.delete(key);
      return null;
    }
    return entry.data;
  }
  function setCache3(key, data) {
    cache3.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS3 });
  }
  async function statsfmFetch(path) {
    const url = `${API_BASE}${path}`;
    const cached = getCached3(url);
    if (cached) return cached;
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) throw new Error("User not found");
      if (response.status === 403) throw new Error("Profile is private");
      if (response.status === 429)
        throw new Error("Rate limited. Try again later");
      throw new Error(`stats.fm API error: ${response.status}`);
    }
    const data = await response.json();
    setCache3(url, data);
    return data;
  }
  async function validateUser2(username) {
    const data = await statsfmFetch(
      `/users/${encodeURIComponent(username)}`
    );
    const item = data.item || data;
    if (!item || !item.customId) {
      throw new Error("User not found");
    }
    return {
      id: item.id,
      customId: item.customId,
      displayName: item.displayName || item.customId,
      image: item.image || void 0,
      isPlus: !!item.isPlus
    };
  }
  function getUsername() {
    const config = getConfig2();
    if (!config?.username) throw new Error("stats.fm not configured");
    return encodeURIComponent(config.username);
  }
  async function getTopTracks2(range, limit = 50) {
    const data = await statsfmFetch(
      `/users/${getUsername()}/top/tracks?range=${range}&limit=${limit}&orderBy=COUNT`
    );
    return data.items || [];
  }
  async function getTopArtists2(range, limit = 50) {
    const data = await statsfmFetch(
      `/users/${getUsername()}/top/artists?range=${range}&limit=${limit}&orderBy=COUNT`
    );
    return data.items || [];
  }
  async function getTopAlbums2(range, limit = 50) {
    try {
      const data = await statsfmFetch(
        `/users/${getUsername()}/top/albums?range=${range}&limit=${limit}&orderBy=COUNT`
      );
      return data.items || [];
    } catch (e) {
      console.warn("[listening-stats] stats.fm API call failed", e);
      return [];
    }
  }
  async function getTopGenres(range, limit = 20) {
    const data = await statsfmFetch(
      `/users/${getUsername()}/top/genres?range=${range}&limit=${limit}`
    );
    return data.items || [];
  }
  async function getRecentStreams(limit = 50) {
    const data = await statsfmFetch(
      `/users/${getUsername()}/streams/recent?limit=${limit}`
    );
    return data.items || [];
  }
  async function getStreamStats(range) {
    const data = await statsfmFetch(
      `/users/${getUsername()}/streams/stats?range=${range}`
    );
    const item = data.items || data;
    return {
      durationMs: item.durationMs || 0,
      count: item.count || 0,
      cardinality: item.cardinality || { tracks: 0, artists: 0, albums: 0 }
    };
  }
  async function getDateStats(range, timeZoneOffset) {
    const tz = timeZoneOffset ?? -(/* @__PURE__ */ new Date()).getTimezoneOffset();
    const data = await statsfmFetch(
      `/users/${getUsername()}/streams/stats/dates?range=${range}&timeZoneOffset=${tz}`
    );
    const item = data.items || data;
    return { hours: item.hours || {} };
  }
  async function refreshPlusStatus() {
    const config = getConfig2();
    if (!config?.username) return false;
    try {
      const info = await validateUser2(config.username);
      if (info.isPlus !== (config.isPlus ?? false)) {
        saveConfig({ ...config, isPlus: info.isPlus });
        return true;
      }
    } catch (e) {
      console.warn("[listening-stats] stats.fm date parsing failed", e);
    }
    return false;
  }
  function extractSpotifyUri(externalIds, type) {
    const ids = externalIds?.spotify;
    if (!ids || ids.length === 0) return "";
    const id = ids[0];
    if (id.startsWith("spotify:")) return id;
    return `spotify:${type}:${id}`;
  }

  // src/services/providers/statsfm.ts
  var FREE_PERIODS = ["weeks", "months", "lifetime"];
  var FREE_LABELS = {
    weeks: "4 Weeks",
    months: "6 Months",
    lifetime: "Lifetime"
  };
  var PLUS_PERIODS = ["today", "weeks", "months", "lifetime"];
  var PLUS_LABELS = {
    today: "Today",
    weeks: "4 Weeks",
    months: "6 Months",
    lifetime: "Lifetime"
  };
  function createStatsfmProvider() {
    const config = getConfig2();
    const isPlus = config?.isPlus ?? false;
    const periods = isPlus ? [...PLUS_PERIODS] : [...FREE_PERIODS];
    const periodLabels = isPlus ? { ...PLUS_LABELS } : { ...FREE_LABELS };
    return {
      type: "statsfm",
      periods,
      periodLabels,
      defaultPeriod: "weeks",
      init() {
        initPoller("statsfm");
        refreshPlusStatus().catch(() => {
        });
      },
      destroy() {
        destroyPoller();
      },
      async calculateStats(period) {
        return calculateStatsfmStats(period);
      }
    };
  }
  async function calculateStatsfmStats(range) {
    const [
      topTracksRaw,
      topArtistsRaw,
      topAlbumsRaw,
      topGenresRaw,
      recentRaw,
      streamStats,
      dateStats
    ] = await Promise.all([
      getTopTracks2(range, 50),
      getTopArtists2(range, 50),
      getTopAlbums2(range, 50),
      getTopGenres(range, 20),
      getRecentStreams(50).catch(() => []),
      getStreamStats(range).catch(() => ({
        durationMs: 0,
        count: 0,
        cardinality: { tracks: 0, artists: 0, albums: 0 }
      })),
      getDateStats(range).catch(() => ({ hours: {} }))
    ]);
    const pollingData = getPollingData();
    const topTracks = topTracksRaw.slice(0, 10).map((item, i) => ({
      trackUri: extractSpotifyUri(item.track.externalIds, "track"),
      trackName: item.track.name,
      artistName: item.track.artists?.[0]?.name || "Unknown Artist",
      albumArt: item.track.albums?.[0]?.image || void 0,
      rank: i + 1,
      totalTimeMs: item.playedMs || (item.streams ? item.track.durationMs * item.streams : item.track.durationMs),
      playCount: item.streams ?? void 0
    }));
    const topArtists = topArtistsRaw.slice(0, 10).map((item, i) => ({
      artistUri: extractSpotifyUri(item.artist.externalIds, "artist"),
      artistName: item.artist.name,
      artistImage: item.artist.image || void 0,
      rank: i + 1,
      genres: item.artist.genres || [],
      playCount: item.streams ?? void 0
    }));
    let topAlbums = topAlbumsRaw.slice(0, 10).map((item) => ({
      albumUri: extractSpotifyUri(item.album.externalIds, "album"),
      albumName: item.album.name,
      artistName: item.album.artists?.[0]?.name || "Unknown Artist",
      albumArt: item.album.image || void 0,
      trackCount: 0,
      playCount: item.streams ?? void 0
    }));
    if (topAlbums.length === 0 && recentRaw.length > 0) {
      const albumMap = /* @__PURE__ */ new Map();
      for (const item of recentRaw) {
        const album = item.track.albums?.[0];
        if (!album?.name) continue;
        const key = `${item.track.artists?.[0]?.name}|||${album.name}`;
        const existing = albumMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          albumMap.set(key, {
            albumName: album.name,
            artistName: item.track.artists?.[0]?.name || "Unknown Artist",
            albumArt: album.image || void 0,
            count: 1
          });
        }
      }
      topAlbums = Array.from(albumMap.values()).sort((a, b) => b.count - a.count).slice(0, 10).map((a) => ({
        albumUri: "",
        albumName: a.albumName,
        artistName: a.artistName,
        albumArt: a.albumArt,
        trackCount: a.count,
        playCount: a.count
      }));
    }
    const recentTracks = recentRaw.map((item) => ({
      trackUri: extractSpotifyUri(item.track.externalIds, "track"),
      trackName: item.track.name,
      artistName: item.track.artists?.[0]?.name || "Unknown Artist",
      artistUri: item.track.artists?.[0]?.externalIds?.spotify?.[0] ? extractSpotifyUri(item.track.artists[0].externalIds, "artist") : "",
      albumName: item.track.albums?.[0]?.name || "",
      albumUri: "",
      albumArt: item.track.albums?.[0]?.image || void 0,
      durationMs: item.durationMs || item.track.durationMs,
      playedAt: new Date(item.endTime).toISOString()
    }));
    const genres = {};
    for (const g of topGenresRaw) {
      genres[g.genre.tag] = g.streams ?? g.position;
    }
    const topGenres = topGenresRaw.slice(0, 10).map((g) => ({ genre: g.genre.tag, count: g.streams ?? g.position }));
    let hourlyDistribution = new Array(24).fill(0);
    const hasDateStats = Object.keys(dateStats.hours).length > 0;
    if (hasDateStats) {
      for (const [hour, stat] of Object.entries(dateStats.hours)) {
        const h = parseInt(hour, 10);
        if (h >= 0 && h < 24) {
          hourlyDistribution[h] = stat.count;
        }
      }
    } else {
      for (const t of recentTracks) {
        const hour = new Date(t.playedAt).getHours();
        hourlyDistribution[hour]++;
      }
    }
    const uniqueTrackCount = streamStats.cardinality?.tracks || new Set(
      topTracksRaw.map(
        (t) => `${t.track.artists?.[0]?.name}|||${t.track.name}`
      )
    ).size;
    const uniqueArtistCount = streamStats.cardinality?.artists || new Set(topArtistsRaw.map((a) => a.artist.name)).size;
    const totalPlays = topTracksRaw.reduce((sum, t) => sum + (t.streams || 0), 0);
    const totalTimeMs = topTracksRaw.reduce(
      (sum, t) => sum + (t.playedMs || (t.streams ? t.track.durationMs * t.streams : 0)),
      0
    );
    const activityDates = [
      ...new Set(
        recentTracks.map((t) => new Date(t.playedAt).toISOString().split("T")[0])
      )
    ];
    return {
      totalTimeMs: streamStats.durationMs || totalTimeMs,
      trackCount: streamStats.count || totalPlays,
      uniqueTrackCount,
      uniqueArtistCount,
      topTracks,
      topArtists,
      topAlbums,
      hourlyDistribution,
      hourlyUnit: "plays",
      peakHour: hourlyDistribution.indexOf(Math.max(...hourlyDistribution)),
      recentTracks,
      genres,
      topGenres,
      streakDays: calculateStreak(activityDates),
      newArtistsCount: 0,
      skipRate: pollingData.totalPlays > 0 ? pollingData.skipEvents / pollingData.totalPlays : 0,
      listenedDays: activityDates.length,
      lastfmConnected: false
    };
  }

  // src/services/providers/index.ts
  var activeProvider = null;
  function getSelectedProviderType() {
    try {
      const stored = localStorage.getItem(LS_KEYS.PROVIDER);
      if (stored === "local" || stored === "lastfm" || stored === "statsfm") {
        return stored;
      }
    } catch (e) {
      console.warn("[listening-stats] Provider selection read failed", e);
    }
    return null;
  }
  function setSelectedProviderType(type) {
    localStorage.setItem(LS_KEYS.PROVIDER, type);
  }
  function hasExistingData() {
    return localStorage.getItem(LS_KEYS.POLLING_DATA) !== null;
  }
  function activateProvider(type, skipInit = false) {
    if (activeProvider) {
      if (!skipInit) activeProvider.destroy();
      activeProvider = null;
    }
    setSelectedProviderType(type);
    switch (type) {
      case "lastfm":
        activeProvider = createLastfmProvider();
        break;
      case "local":
        activeProvider = createLocalProvider();
        break;
      case "statsfm":
        activeProvider = createStatsfmProvider();
        break;
    }
    if (!skipInit) {
      activeProvider.init();
    }
  }

  // src/app.tsx
  window.ListeningStats = {
    resetLastfmKey: () => {
      clearConfig();
      log("Last.fm API key cleared. Reload the app to reconfigure.");
    },
    getTrackingStatus,
    getLastError,
    getLogs,
    testWrite: async () => {
      const result = await runTrackingTest();
      console.log("[ListeningStats] testWrite result:", result);
      return result;
    }
  };
  async function main() {
    initPoller("local");
    startupIntegrityCheck().then((result) => {
      if (!result.ok) {
        setTrackingHealthy(false, result.error);
        console.warn("[listening-stats] Startup integrity check failed:", result.error);
        Spicetify?.showNotification?.(
          "Tracking database issue detected \u2014 try restarting Spotify",
          true
        );
      }
    });
    let providerType = getSelectedProviderType();
    if (!providerType && hasExistingData()) {
      providerType = "local";
      setSelectedProviderType("local");
    }
    if (providerType) {
      activateProvider(providerType);
    }
  }
  (function init(retries = 0) {
    if (!Spicetify.Player || !Spicetify.Platform || !Spicetify.CosmosAsync) {
      if (retries >= 50) {
        console.error("[listening-stats] Spicetify not ready after 5s, giving up");
        Spicetify?.showNotification?.("Listening Stats failed to initialize \u2014 try restarting Spotify", true);
        return;
      }
      setTimeout(() => init(retries + 1), 100);
      return;
    }
    main();
  })();
})();
