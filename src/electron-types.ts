/**
 * Minimal type definitions for the Electron APIs used by this package.
 * Avoids requiring the full `electron` type package as a dependency.
 * These match the subset of Electron's public API that we actually call.
 */

export interface ElectronSession {
  clearStorageData(options: { storages: string[] }): Promise<void>;
  clearCache(): Promise<void>;
}

export interface ElectronPowerMonitor {
  on(event: 'suspend' | 'resume', listener: () => void): void;
  removeListener(event: 'suspend' | 'resume', listener: () => void): void;
}

export interface AppMetricsCpu {
  percentCPUUsage: number;
}

export interface AppMetricsMemory {
  workingSetSize: number;
}

export interface AppMetrics {
  type: string;
  pid: number;
  cpu: AppMetricsCpu;
  memory: AppMetricsMemory;
}

export interface ElectronApp {
  getAppMetrics(): AppMetrics[];
}
