import type { ElectronPowerMonitor } from './electron-types';

/**
 * Callbacks invoked on power state changes.
 */
export interface PowerStateCallbacks {
  /**
   * Called when the system is about to suspend (sleep/hibernate).
   * Use this to pause polling timers, close network connections,
   * or save state.
   */
  onSuspend: () => void;

  /**
   * Called after the system resumes from suspend.
   * Network may not be available immediately — use `resumeDelayMs`
   * if you need to restart network-dependent operations.
   */
  onResume: () => void;
}

export interface ManagePowerStateOptions {
  /**
   * Delay in milliseconds before calling `onResume` after wake.
   * Gives the OS time to reconnect WiFi, re-establish VPN, etc.
   * Default: 5000 (5 seconds)
   */
  resumeDelayMs?: number;
}

/**
 * Manages power state transitions (sleep/wake) for an Electron app.
 *
 * When a laptop sleeps and wakes, polling timers that fired during sleep
 * all execute at once. Network requests fail because WiFi hasn't reconnected.
 * GPU contexts may be lost. This function provides a clean pause/resume
 * lifecycle with a configurable delay for network recovery.
 *
 * @param powerMonitor - Electron's `powerMonitor` module
 * @param callbacks - Functions to call on suspend/resume
 * @param options - Optional configuration
 * @returns Cleanup function that removes all listeners
 *
 * @example
 * ```ts
 * import { managePowerState } from 'electron-optimize';
 * import { powerMonitor } from 'electron';
 *
 * const cleanup = managePowerState(powerMonitor, {
 *   onSuspend() {
 *     clearInterval(pollingTimer);
 *     pollingTimer = null;
 *   },
 *   onResume() {
 *     pollingTimer = setInterval(checkForUpdates, 60_000);
 *   },
 * });
 *
 * // Call cleanup() when the app is shutting down
 * app.on('before-quit', cleanup);
 * ```
 */
export function managePowerState(
  powerMonitor: ElectronPowerMonitor,
  callbacks: PowerStateCallbacks,
  options?: ManagePowerStateOptions,
): () => void {
  const resumeDelay = options?.resumeDelayMs ?? 5_000;
  let resumeTimeout: ReturnType<typeof setTimeout> | null = null;

  const onSuspend = () => {
    // Cancel any pending resume callback from a rapid suspend/resume cycle
    if (resumeTimeout) {
      clearTimeout(resumeTimeout);
      resumeTimeout = null;
    }
    callbacks.onSuspend();
  };

  const onResume = () => {
    if (resumeDelay > 0) {
      resumeTimeout = setTimeout(() => {
        resumeTimeout = null;
        callbacks.onResume();
      }, resumeDelay);
    } else {
      callbacks.onResume();
    }
  };

  powerMonitor.on('suspend', onSuspend);
  powerMonitor.on('resume', onResume);

  return () => {
    powerMonitor.removeListener('suspend', onSuspend);
    powerMonitor.removeListener('resume', onResume);
    if (resumeTimeout) {
      clearTimeout(resumeTimeout);
      resumeTimeout = null;
    }
  };
}
