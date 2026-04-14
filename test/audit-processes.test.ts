import { describe, expect, it } from "vitest";
import { auditProcesses } from "../src/audit-processes";
import type { ElectronApp } from "../src/electron-types";

function mockApp(metrics: { type: string; pid: number; cpu: number; memoryKB: number }[]): ElectronApp {
  return {
    getAppMetrics: () =>
      metrics.map((m) => ({
        type: m.type,
        pid: m.pid,
        cpu: { percentCPUUsage: m.cpu },
        memory: { workingSetSize: m.memoryKB },
      })),
  };
}

describe("auditProcesses", () => {
  it("returns process info for all metrics", () => {
    const app = mockApp([
      { type: "Browser", pid: 100, cpu: 5, memoryKB: 50_000 },
      { type: "GPU", pid: 200, cpu: 2, memoryKB: 260_000 },
      { type: "Tab", pid: 300, cpu: 10, memoryKB: 80_000 },
    ]);

    const result = auditProcesses(app);
    expect(result.processes).toHaveLength(3);
    expect(result.processes[0].type).toBe("Browser");
    expect(result.processes[1].type).toBe("GPU");
    expect(result.processes[2].type).toBe("Tab");
  });

  it("calculates total memory across all processes", () => {
    const app = mockApp([
      { type: "Browser", pid: 100, cpu: 0, memoryKB: 10_000 },
      { type: "GPU", pid: 200, cpu: 0, memoryKB: 20_000 },
    ]);

    const result = auditProcesses(app);
    // workingSetSize is in KB, converted to bytes (* 1024)
    expect(result.totalMemory).toBe((10_000 + 20_000) * 1024);
  });

  it("identifies GPU process", () => {
    const app = mockApp([
      { type: "Browser", pid: 100, cpu: 0, memoryKB: 10_000 },
      { type: "GPU", pid: 200, cpu: 0, memoryKB: 260_000 },
    ]);

    const result = auditProcesses(app);
    expect(result.gpuMemory).toBe(260_000 * 1024);
    expect(result.processes[1].isGpu).toBe(true);
    expect(result.processes[0].isGpu).toBe(false);
  });

  it("counts renderer processes (Tab and Renderer types)", () => {
    const app = mockApp([
      { type: "Browser", pid: 100, cpu: 0, memoryKB: 10_000 },
      { type: "Tab", pid: 300, cpu: 0, memoryKB: 50_000 },
      { type: "Renderer", pid: 400, cpu: 0, memoryKB: 50_000 },
      { type: "Utility", pid: 500, cpu: 0, memoryKB: 30_000 },
    ]);

    const result = auditProcesses(app);
    expect(result.rendererCount).toBe(2);
  });

  it("returns 0 gpuMemory when no GPU process exists", () => {
    const app = mockApp([{ type: "Browser", pid: 100, cpu: 0, memoryKB: 10_000 }]);

    const result = auditProcesses(app);
    expect(result.gpuMemory).toBe(0);
  });

  it("formats memory as human-readable strings", () => {
    const app = mockApp([{ type: "Browser", pid: 100, cpu: 0, memoryKB: 100_000 }]);

    const result = auditProcesses(app);
    // 100_000 KB * 1024 = 102_400_000 bytes = ~97.7 MB
    expect(result.processes[0].memoryFormatted).toContain("MB");
    expect(result.totalMemoryFormatted).toContain("MB");
  });

  it("handles empty metrics (no processes)", () => {
    const app = mockApp([]);
    const result = auditProcesses(app);
    expect(result.processes).toHaveLength(0);
    expect(result.totalMemory).toBe(0);
    expect(result.rendererCount).toBe(0);
    expect(result.gpuMemory).toBe(0);
  });

  it("preserves CPU usage percentage", () => {
    const app = mockApp([{ type: "Browser", pid: 100, cpu: 42.5, memoryKB: 10_000 }]);

    const result = auditProcesses(app);
    expect(result.processes[0].cpu).toBe(42.5);
  });
});
