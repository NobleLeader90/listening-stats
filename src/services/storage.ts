import { deleteDB, openDB, type IDBPDatabase } from "idb";
import { LS_KEYS } from "../constants";
import { PlayEvent } from "../types/listeningstats";
import { error, log, warn } from "./logger";

const DB_NAME = "listening-stats";
const DB_VERSION = 4;
const STORE_NAME = "playEvents";
const BACKUP_DB_NAME = "listening-stats-backup";

let dbPromise: Promise<IDBPDatabase> | null = null;

/**
 * Create a backup of all play events before migration.
 * Always writes a fresh backup, replacing any stale backup from a previous failed attempt.
 * Tries localStorage first; falls back to a separate IndexedDB database on QuotaExceededError.
 */
async function backupBeforeMigration(): Promise<PlayEvent[]> {
  let events: PlayEvent[] = [];

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

    // Store old version so we know a migration is in progress
    localStorage.setItem(LS_KEYS.MIGRATION_VERSION, String(version));

    // Try localStorage first (always overwrite any stale backup)
    try {
      const json = JSON.stringify(events);
      localStorage.setItem(LS_KEYS.MIGRATION_BACKUP, json);
      log(` Backed up ${events.length} events to localStorage`);
    } catch (e: any) {
      if (e?.name === "QuotaExceededError" || e?.code === 22) {
        // localStorage full -- fall back to separate IndexedDB database
        warn(" localStorage full, using IndexedDB backup");
        localStorage.removeItem(LS_KEYS.MIGRATION_BACKUP);

        // Always replace stale backup DB
        try {
          await deleteDB(BACKUP_DB_NAME);
        } catch {
          // Backup DB may not exist -- safe to ignore
        }

        const backupDb = await openDB(BACKUP_DB_NAME, 1, {
          upgrade(db) {
            db.createObjectStore("backup");
          },
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

/**
 * Restore play events from backup after a failed migration.
 * Reads from localStorage first, then falls back to the backup IndexedDB database.
 */
async function restoreFromBackup(): Promise<void> {
  let events: PlayEvent[] | null = null;

  // Try localStorage first
  try {
    const json = localStorage.getItem(LS_KEYS.MIGRATION_BACKUP);
    if (json) {
      events = JSON.parse(json);
    }
  } catch {
    // Corrupted JSON in localStorage backup -- fall through to IndexedDB backup
  }

  // Fall back to IndexedDB backup
  if (!events) {
    try {
      const backupDb = await openDB(BACKUP_DB_NAME, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains("backup")) {
            db.createObjectStore("backup");
          }
        },
      });
      events = await backupDb.get("backup", "events");
      backupDb.close();
    } catch {
      // No backup database exists -- backup may have been cleaned up already
    }
  }

  if (events && events.length > 0) {
    try {
      // Open the DB at whatever version it ended up at
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

  // Clean up backup artifacts regardless
  await cleanupBackup();
}

/**
 * Remove all backup artifacts (localStorage keys and backup IndexedDB database).
 * Called after both successful migration and successful rollback.
 */
async function cleanupBackup(): Promise<void> {
  try {
    localStorage.removeItem(LS_KEYS.MIGRATION_BACKUP);
  } catch (e) {
    console.warn(
      "[listening-stats] Failed to remove migration backup from localStorage",
      e,
    );
  }
  try {
    localStorage.removeItem(LS_KEYS.MIGRATION_VERSION);
  } catch (e) {
    console.warn(
      "[listening-stats] Failed to remove migration version from localStorage",
      e,
    );
  }
  try {
    await deleteDB(BACKUP_DB_NAME);
  } catch {
    // Backup DB may not exist -- safe to ignore
  }
}

export function resetDBPromise(): void {
  dbPromise = null;
}

export async function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = initDB();
  }
  try {
    const db = await dbPromise;
    // Verify connection is still alive by attempting a real transaction
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      tx.abort();
      await tx.done.catch(() => {});
    } catch {
      // Connection is dead (InvalidStateError after browser sleep/wake) -- reconnect
      log("IndexedDB connection stale, reconnecting...");
      dbPromise = initDB();
      return dbPromise;
    }
    return db;
  } catch {
    // Initial connection failed -- retry with fresh init
    dbPromise = initDB();
    return dbPromise;
  }
}

async function initDB(): Promise<IDBPDatabase> {
  // Check if DB already exists without creating an empty one
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
    // Feature detection -- databases() not available in all browsers, fall back to opening
    try {
      const existingDb = await openDB(DB_NAME);
      oldDbVersion = existingDb.version;
      existingDb.close();
      needsBackup = oldDbVersion < DB_VERSION && oldDbVersion > 0;
    } catch {
      // DB does not exist yet -- fresh install, no backup needed
      needsBackup = false;
    }
  }

  // Back up before migration if the DB exists and is an older version
  if (needsBackup) {
    await backupBeforeMigration();
  }

  try {
    const db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        // Ensure store exists (handles both fresh install and corrupted state)
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("by-startedAt", "startedAt");
          store.createIndex("by-trackUri", "trackUri");
          store.createIndex("by-artistUri", "artistUri");
          store.createIndex("by-type", "type");
        } else {
          // Store exists, add any missing indexes
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
      },
    });

    // Successful migration -- clean up backup and notify user
    if (needsBackup) {
      await cleanupBackup();
      Spicetify?.showNotification?.("Database updated successfully");
      log(` Migration from v${oldDbVersion} to v${DB_VERSION} complete`);
    }

    // Run one-time dedup pass if needed (v2: keeps highest playedMs per group)
    const dedupDone = localStorage.getItem(LS_KEYS.DEDUP_V2_DONE);
    if (!dedupDone) {
      const dedupResult = await runDedup(db);
      if (dedupResult.removed > 0) {
        Spicetify?.showNotification?.(
          `Cleaned up ${dedupResult.removed} duplicate entries`,
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

    // Re-open at whatever version the DB is now (fallback)
    const fallbackDb = await openDB(DB_NAME);
    log(` Opened fallback DB at v${fallbackDb.version}`);
    return fallbackDb;
  }
}

/**
 * Internal dedup runner that operates on an already-opened database.
 * Groups events by trackUri:startedAt, keeps the entry with the highest playedMs.
 */
async function runDedup(
  db: IDBPDatabase,
): Promise<{ removed: number; affectedTracks: number }> {
  try {
    const allEvents: PlayEvent[] = await db.getAll(STORE_NAME);
    const byKey = new Map<string, PlayEvent>();

    for (const event of allEvents) {
      const key = `${event.trackUri}:${event.startedAt}`;
      const existing = byKey.get(key);
      if (!existing || event.playedMs > existing.playedMs) {
        byKey.set(key, event);
      }
    }

    const keepIds = new Set(Array.from(byKey.values()).map((e) => e.id!));
    const toDelete = allEvents.filter((e) => !keepIds.has(e.id!));
    const affectedTracks = new Set(toDelete.map((e) => e.trackUri));

    if (toDelete.length > 0) {
      const tx = db.transaction(STORE_NAME, "readwrite");
      for (const event of toDelete) {
        tx.store.delete(event.id!);
      }
      await tx.done;
      log(
        ` Removed ${toDelete.length} duplicate events across ${affectedTracks.size} tracks`,
      );
    }

    return { removed: toDelete.length, affectedTracks: affectedTracks.size };
  } catch (e) {
    error(" Dedup failed:", e);
    return { removed: 0, affectedTracks: 0 };
  }
}

export async function addPlayEvent(event: PlayEvent): Promise<boolean> {
  try {
    const db = await getDB();
    const range = IDBKeyRange.only(event.startedAt);
    const existing = await db.getAllFromIndex(
      STORE_NAME,
      "by-startedAt",
      range,
    );
    if (existing.some((e: PlayEvent) => e.trackUri === event.trackUri)) {
      warn(" Duplicate event blocked:", event.trackName);
      return false;
    }
    await db.add(STORE_NAME, event);
    return true;
  } catch (e) {
    // Connection likely dead, reset so next call reconnects
    warn(" addPlayEvent failed, resetting DB connection:", e);
    dbPromise = null;
    throw e;
  }
}

export async function deduplicateExistingEvents(): Promise<{
  removed: number;
  affectedTracks: number;
}> {
  const db = await getDB();
  return runDedup(db);
}

export async function getPlayEventsByTimeRange(
  start: Date,
  end: Date,
): Promise<PlayEvent[]> {
  const db = await getDB();
  const range = IDBKeyRange.bound(start.getTime(), end.getTime());
  return db.getAllFromIndex(STORE_NAME, "by-startedAt", range);
}

export async function getAllPlayEvents(): Promise<PlayEvent[]> {
  const db = await getDB();
  return db.getAll(STORE_NAME);
}

export async function clearAllData(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_NAME);
  resetDBPromise();
  log("IndexedDB data cleared");
}

/**
 * Writes a test entry and immediately deletes it to verify the DB is writable.
 * Shared by startupIntegrityCheck() and the window.ListeningStats.testWrite() console API.
 */
export async function runTrackingTest(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const db = await getDB();
    // Write test entry
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
      type: "play" as const,
    };
    await db.add(STORE_NAME, testEvent);
    // Clean up: find and delete all test entries
    const testEntries = await db.getAllFromIndex(
      STORE_NAME,
      "by-trackUri",
      IDBKeyRange.only("__ls_test__"),
    );
    if (testEntries.length > 0) {
      const tx = db.transaction(STORE_NAME, "readwrite");
      for (const e of testEntries) {
        if ((e as any).id) await tx.store.delete((e as any).id);
      }
      await tx.done;
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Verifies DB is accessible, object store exists, required indexes are intact,
 * and a write+delete roundtrip succeeds. Called on local provider init.
 */
export async function startupIntegrityCheck(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const db = await getDB();
    // Check object store exists
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      return { ok: false, error: "Object store missing" };
    }
    // Verify required indexes
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.store;
    const requiredIndexes = [
      "by-startedAt",
      "by-trackUri",
      "by-artistUri",
      "by-type",
    ];
    for (const idx of requiredIndexes) {
      if (!store.indexNames.contains(idx)) {
        tx.abort();
        return { ok: false, error: `Index missing: ${idx}` };
      }
    }
    await tx.done.catch(() => {});
    // Write+delete roundtrip
    return runTrackingTest();
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
