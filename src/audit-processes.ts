import type { ElectronApp } from "./electron-types";

/**
 * Information about a single Chromium/Electron process.
 */
export interface ProcessInfo {
  /** Process type: Browser (main), GPU, Renderer, Utility, etc. */
  type: string;

  /** OS process ID */
  pid: number;

  /**
   * CPU usage percentage over the measurement interval. May exceed 100 on
   * multi-core systems: macOS and Linux report ~100 per fully-utilized core
   * (Windows normalizes to 0-100).
   */
  cpu: number;

  /** Working set size in bytes (resident memory) */
  memory: number;

  /** Working set size formatted as human-readable string */
  memoryFormatted: string;

  /** Whether this process is the GPU process */
  isGpu: boolean;

  /** Whether this process is a renderer */
  isRenderer: boolean;
}

export interface AuditResult {
  /** All processes */
  processes: ProcessInfo[];

  /** Total memory across all processes in bytes */
  totalMemory: number;

  /** Total memory formatted as human-readable string */
  totalMemoryFormatted: string;

  /** Number of renderer processes */
  rendererCount: number;

  /** Memory used by GPU process (0 if none found) */
  gpuMemory: number;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes / 1024;
  for (const unit of ["KB", "MB"]) {
    // Pick the tier by the *displayed* value so e.g. 1048570 bytes renders
    // as "1.0 MB", not "1024.0 KB" (toFixed rounds up at the boundary).
    if (Number(value.toFixed(1)) < 1024) return `${value.toFixed(1)} ${unit}`;
    value /= 1024;
  }
  return `${value.toFixed(1)} GB`;
}

/**
 * Audits all Chromium/Electron child processes and their resource usage.
 *
 * Reports CPU and memory for every process: main (Browser), GPU, renderers,
 * and utility processes (Network Service, Audio Service, etc.). Useful for
 * development profiling — shows exactly where memory is going and whether
 * you have processes you don't expect.
 *
 * Relies on Electron's `app.getAppMetrics()` which samples CPU over the
 * interval since the last call. Call it periodically or on-demand.
 *
 * @param app - Electron's `app` module
 * @returns Audit result with per-process and aggregate data
 *
 * @example
 * ```ts
 * import { auditProcesses } from '@yawlabs/electron-optimize';
 * import { app } from 'electron';
 *
 * // Log process breakdown on startup
 * app.whenReady().then(() => {
 *   setTimeout(() => {
 *     const audit = auditProcesses(app);
 *     console.log(`Total: ${audit.totalMemoryFormatted} across ${audit.processes.length} processes`);
 *     console.log(`GPU: ${audit.processes.find(p => p.isGpu)?.memoryFormatted ?? 'N/A'}`);
 *     console.log(`Renderers: ${audit.rendererCount}`);
 *     for (const p of audit.processes) {
 *       console.log(`  ${p.type} (pid ${p.pid}): ${p.memoryFormatted}`);
 *     }
 *   }, 5000); // Wait for processes to stabilize
 * });
 * ```
 */
export function auditProcesses(app: ElectronApp): AuditResult {
  const metrics = app.getAppMetrics();

  const processes: ProcessInfo[] = metrics.map((m) => {
    // getAppMetrics returns KB; treat a malformed/missing workingSetSize as 0
    // so memory and memoryFormatted never become NaN.
    const mem = Number.isFinite(m.memory.workingSetSize) ? m.memory.workingSetSize * 1024 : 0;
    return {
      type: m.type,
      pid: m.pid,
      cpu: m.cpu.percentCPUUsage,
      memory: mem,
      memoryFormatted: formatBytes(mem),
      isGpu: m.type === "GPU",
      isRenderer: m.type === "Tab" || m.type === "Renderer",
    };
  });

  const totalMemory = processes.reduce((sum, p) => sum + p.memory, 0);
  const rendererCount = processes.filter((p) => p.isRenderer).length;
  const gpuProcess = processes.find((p) => p.isGpu);

  return {
    processes,
    totalMemory,
    totalMemoryFormatted: formatBytes(totalMemory),
    rendererCount,
    gpuMemory: gpuProcess?.memory ?? 0,
  };
}
