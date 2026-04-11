export { cleanupTempFiles } from './cleanup-temp-files';
export type { CleanupTempFilesOptions } from './cleanup-temp-files';

export { clearCacheOnUpdate } from './clear-cache-on-update';
export type { ClearCacheOnUpdateOptions, ClearCacheOnUpdateResult } from './clear-cache-on-update';

export { validateWindowBounds } from './validate-window-bounds';
export type { WindowBounds, DisplayWorkArea, ValidateWindowBoundsOptions } from './validate-window-bounds';

export { createStartupTimer } from './startup-timer';
export type { StartupMark } from './startup-timer';

export { managePowerState } from './manage-power-state';
export type { PowerStateCallbacks, ManagePowerStateOptions } from './manage-power-state';

export { auditProcesses } from './audit-processes';
export type { ProcessInfo, AuditResult } from './audit-processes';

export type {
  ElectronSession,
  ElectronPowerMonitor,
  ElectronApp,
} from './electron-types';
