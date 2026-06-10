import fs from "node:fs";
import path from "node:path";
import type { ElectronSession } from "./electron-types";

export interface ClearCacheOnUpdateOptions {
  /**
   * Clear CacheStorage (Service Worker caches). Default: true.
   *
   * **Warning:** Offline-first apps that store data in CacheStorage
   * should set this to `false` — clearing it will delete cached responses
   * that the app relies on for offline functionality.
   */
  clearCacheStorage?: boolean;

  /**
   * Clear the HTTP disk cache. Default: true.
   *
   * Safe for all apps. HTTP cache is rebuilt automatically on next request.
   */
  clearHttpCache?: boolean;

  /**
   * Filename used to track the last-run version. Stored inside userData.
   * Default: '.last-version'
   */
  versionFilename?: string;
}

export interface ClearCacheOnUpdateResult {
  /** Whether the version changed since last run (also true on first run) */
  versionChanged: boolean;
  /** The version from the previous run, or null on first run */
  previousVersion: string | null;
  /** The current version (trimmed) */
  currentVersion: string;
  /** True when no previous version was recorded (fresh install) */
  isFirstRun: boolean;
  /**
   * True when every attempted cache clear succeeded (vacuously true when
   * none ran — version unchanged or both clears disabled).
   */
  cleared: boolean;
  /**
   * True when the version file now records `currentVersion`. False means a
   * clear or the version-file write failed, so the next launch will retry.
   */
  recorded: boolean;
}

/**
 * Clears Electron's disk caches when the app version changes.
 *
 * After an update, stale compiled resources in the HTTP cache and
 * CacheStorage can cause the renderer to load old code. This function
 * detects version changes and clears the relevant caches.
 *
 * **Not on by default** — you must explicitly call this function.
 * Offline-first apps should either skip this entirely or set
 * `clearCacheStorage: false` to preserve cached responses.
 *
 * Call this once during startup, after `app.whenReady()`.
 *
 * @param userData - Path from `app.getPath('userData')`
 * @param currentVersion - Current app version from `app.getVersion()`
 * @param session - Electron's `session.defaultSession` (or any object with `clearStorageData` and `clearCache`)
 * @param options - Optional configuration
 *
 * @example
 * ```ts
 * import { clearCacheOnUpdate } from '@yawlabs/electron-optimize';
 * import { app, session } from 'electron';
 *
 * app.whenReady().then(async () => {
 *   const result = await clearCacheOnUpdate(
 *     app.getPath('userData'),
 *     app.getVersion(),
 *     session.defaultSession,
 *   );
 *   if (result.versionChanged && !result.isFirstRun) {
 *     console.log(`Updated from ${result.previousVersion} to ${result.currentVersion}`);
 *   }
 * });
 * ```
 */
export async function clearCacheOnUpdate(
  userData: string,
  currentVersion: string,
  session: ElectronSession,
  options?: ClearCacheOnUpdateOptions,
): Promise<ClearCacheOnUpdateResult> {
  const filename = options?.versionFilename ?? ".last-version";
  const clearCacheStorage = options?.clearCacheStorage ?? true;
  const clearHttpCache = options?.clearHttpCache ?? true;
  const versionFile = path.join(userData, filename);
  // Normalize: the file is read back with .trim(), so write/compare the same
  // form — otherwise a padded version string would re-clear on every launch.
  const version = currentVersion.trim();

  let previousVersion: string | null = null;
  try {
    previousVersion = fs.readFileSync(versionFile, "utf-8").trim();
  } catch {
    // First run — no version file yet
  }

  const versionChanged = previousVersion !== version;
  const isFirstRun = previousVersion === null;
  let cleared = true;
  let recorded = !versionChanged;

  if (versionChanged) {
    const attempts: Promise<boolean>[] = [];

    if (clearCacheStorage) {
      attempts.push(
        session
          .clearStorageData({ storages: ["cachestorage"] })
          .then(() => true)
          .catch(() => false),
      );
    }

    if (clearHttpCache) {
      attempts.push(
        session
          .clearCache()
          .then(() => true)
          .catch(() => false),
      );
    }

    const results = await Promise.all(attempts);
    // Only record the new version if every attempted clear succeeded; otherwise
    // leave the old version on disk so the next launch retries the clears.
    cleared = results.every(Boolean);

    if (cleared) {
      try {
        fs.writeFileSync(versionFile, version);
        recorded = true;
      } catch {
        // Best effort — the next launch will re-clear and retry the write
      }
    }
  }

  return { versionChanged, previousVersion, currentVersion: version, isFirstRun, cleared, recorded };
}
