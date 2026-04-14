import fs from "node:fs";
import path from "node:path";

/**
 * Directories inside Electron's userData where Chromium accumulates
 * temporary files that are never cleaned up automatically.
 *
 * - `Network/` — HTTP cache transaction files (.tmp)
 * - `Session Storage/` — LevelDB compaction leftovers (LOG.old*.TMP)
 *
 * These grow unbounded over time and are safe to remove on startup
 * (before Chromium opens them).
 */
const DEFAULT_SUBDIRS = ["Network", "Session Storage"];

export interface CleanupTempFilesOptions {
  /**
   * Subdirectories within userData to scan. Defaults to
   * `['Network', 'Session Storage']`.
   */
  subdirs?: string[];

  /**
   * File extensions to remove (case-insensitive). Defaults to `['.tmp']`.
   */
  extensions?: string[];
}

/**
 * Removes stale temporary files from Chromium's internal directories.
 *
 * Chromium creates `.tmp` files during network transactions and LevelDB
 * compaction that are never cleaned up. Over weeks of use, these accumulate
 * and waste disk space.
 *
 * Call this once during app startup, after `app.whenReady()` resolves,
 * before creating any BrowserWindows.
 *
 * @param userData - Path from `app.getPath('userData')`
 * @param options - Optional configuration
 * @returns Number of files removed
 *
 * @example
 * ```ts
 * import { cleanupTempFiles } from 'electron-optimize';
 * import { app } from 'electron';
 *
 * app.whenReady().then(() => {
 *   const removed = cleanupTempFiles(app.getPath('userData'));
 *   console.log(`Cleaned up ${removed} temp files`);
 * });
 * ```
 */
export function cleanupTempFiles(userData: string, options?: CleanupTempFilesOptions): number {
  const subdirs = options?.subdirs ?? DEFAULT_SUBDIRS;
  const extensions = (options?.extensions ?? [".tmp"]).map((e) => e.toLowerCase());
  let removed = 0;

  for (const sub of subdirs) {
    const dir = path.join(userData, sub);
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      // Directory may not exist on first run
      continue;
    }
    for (const file of entries) {
      const lower = file.toLowerCase();
      if (extensions.some((ext) => lower.endsWith(ext))) {
        try {
          fs.unlinkSync(path.join(dir, file));
          removed++;
        } catch {
          // File may be locked by another process — skip it
        }
      }
    }
  }

  return removed;
}
