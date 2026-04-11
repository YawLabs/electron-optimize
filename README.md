# electron-optimize

Drop-in optimization utilities for Electron apps. Each function is independent — import what you need, skip what you don't.

Built by [Yaw Labs](https://yaw.sh), extracted from a shipping Electron app after a user ran a full performance audit and we systematically verified every finding.

## Install

```bash
npm install @yawlabs/electron-optimize
```

## Modules

### cleanupTempFiles

Chromium creates `.tmp` files in `Network/` and `Session Storage/` directories that are never cleaned up. Over weeks of use, these accumulate silently. This function removes them on startup.

```ts
import { cleanupTempFiles } from '@yawlabs/electron-optimize';
import { app } from 'electron';

app.whenReady().then(() => {
  const removed = cleanupTempFiles(app.getPath('userData'));
  if (removed > 0) console.log(`Cleaned ${removed} temp files`);
});
```

**Options:**
- `subdirs` — directories to scan (default: `['Network', 'Session Storage']`)
- `extensions` — file extensions to remove, case-insensitive (default: `['.tmp']`)

### clearCacheOnUpdate

After an app update, stale compiled resources in the HTTP cache can cause the renderer to load old code. This detects version changes and clears the relevant caches.

**Not called automatically** — you must explicitly call this function. Offline-first apps should either skip this or set `clearCacheStorage: false`.

```ts
import { clearCacheOnUpdate } from '@yawlabs/electron-optimize';
import { app, session } from 'electron';

app.whenReady().then(async () => {
  const result = await clearCacheOnUpdate(
    app.getPath('userData'),
    app.getVersion(),
    session.defaultSession,
  );
  if (result.versionChanged) {
    console.log(`Updated ${result.previousVersion} -> ${result.currentVersion}`);
  }
});
```

**Options:**
- `clearCacheStorage` — clear Service Worker caches (default: `true`). Set to `false` for offline-first apps.
- `clearHttpCache` — clear HTTP disk cache (default: `true`)
- `versionFilename` — file used to track last-run version (default: `'.last-version'`)

### validateWindowBounds

When users save and restore window positions, saved coordinates become invalid if a monitor is disconnected, resolution changes, or DPI settings change. This ensures windows always appear on a visible display.

```ts
import { validateWindowBounds } from '@yawlabs/electron-optimize';
import { screen, BrowserWindow } from 'electron';

// Restoring a saved window
const saved = loadSavedBounds(); // { x, y, width, height } or null
const targetPoint = saved ?? screen.getCursorScreenPoint();
const display = screen.getDisplayNearestPoint(targetPoint);
const bounds = validateWindowBounds(saved, display.workArea);

const win = new BrowserWindow({ ...bounds });
```

**How it works:**
1. Checks if saved position falls within the target display
2. If on-screen: clamps to display edges (prevents partial off-screen)
3. If off-screen: centers at 80% of display size
4. Enforces minimum dimensions (400x300 default)

**Options:**
- `defaultWidthFraction` / `defaultHeightFraction` — size for new/off-screen windows (default: `0.8`)
- `minWidth` / `minHeight` — minimum window dimensions (default: `400` / `300`)

### createStartupTimer

Measures initialization milestones with `process.hrtime.bigint()` for sub-millisecond precision. Zero overhead when marks aren't read.

```ts
import { createStartupTimer } from '@yawlabs/electron-optimize';

const timer = createStartupTimer();

import { app } from 'electron';
timer.mark('imports done');

app.whenReady().then(() => {
  timer.mark('app ready');
  createWindow();
  timer.mark('window created');
});

// In ready-to-show handler
win.once('ready-to-show', () => {
  timer.mark('ready-to-show');
  timer.flush();
  win.show();
});
```

Output:
```
[startup]
     45.2ms  imports done
    312.7ms  app ready
    318.4ms  window created
    487.1ms  ready-to-show
```

**Methods:**
- `mark(label)` — record a milestone
- `flush()` — print all marks and reset
- `getMarks()` — read marks as structured data
- `reset()` — clear without printing

### managePowerState

When a laptop sleeps and wakes, polling timers that fired during sleep all execute at once, and network requests fail because WiFi hasn't reconnected. This provides a clean pause/resume lifecycle.

```ts
import { managePowerState } from '@yawlabs/electron-optimize';
import { powerMonitor, app } from 'electron';

let pollingTimer: ReturnType<typeof setInterval> | null = null;

const cleanup = managePowerState(powerMonitor, {
  onSuspend() {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  },
  onResume() {
    pollingTimer = setInterval(checkForUpdates, 60_000);
  },
});

app.on('before-quit', cleanup);
```

**Options:**
- `resumeDelayMs` — delay before calling `onResume` after wake (default: `5000`). Gives the OS time to reconnect WiFi, re-establish VPN, etc.

**Handles edge cases:**
- Rapid suspend/resume cycles (cancels pending resume callback)
- Returns cleanup function that removes all listeners

### auditProcesses

Lists all Chromium/Electron child processes with CPU and memory usage. Useful for development profiling.

```ts
import { auditProcesses } from '@yawlabs/electron-optimize';
import { app } from 'electron';

// Wait for processes to stabilize, then audit
setTimeout(() => {
  const audit = auditProcesses(app);
  console.log(`Total: ${audit.totalMemoryFormatted} across ${audit.processes.length} processes`);
  for (const p of audit.processes) {
    console.log(`  ${p.type} (pid ${p.pid}): ${p.memoryFormatted}`);
  }
}, 5000);
```

**Returns:**
- `processes` — per-process type, PID, CPU%, memory
- `totalMemory` / `totalMemoryFormatted` — aggregate memory
- `rendererCount` — number of renderer processes
- `gpuMemory` — memory used by GPU process

## What this package does NOT do

- **Packaging optimizations** — use electron-builder or electron-forge for locale stripping, ASAR configuration, etc.
- **V8 snapshots** — use [electron-link](https://github.com/nicolo-ribaudo/electron-link) for pre-initialized V8 heaps
- **Automatic optimization** — nothing runs unless you call it. No magic `optimize()` function.

These are deliberate scope boundaries, not missing features.

## Requirements

- Electron >= 20.0.0
- Node.js >= 16

## License

MIT
