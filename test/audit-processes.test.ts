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

  it("formats zero memory as bytes", () => {
    const app = mockApp([{ type: "Browser", pid: 100, cpu: 0, memoryKB: 0 }]);
    const result = auditProcesses(app);
    expect(result.processes[0].memoryFormatted).toBe("0 B");
    expect(result.totalMemoryFormatted).toBe("0 B");
  });

  it("formats the smallest nonzero memory at the 1024-byte boundary as KB", () => {
    // workingSetSize is in KB, so the smallest nonzero value is 1 KB = 1024 bytes
    const app = mockApp([{ type: "Browser", pid: 100, cpu: 0, memoryKB: 1 }]);
    const result = auditProcesses(app);
    expect(result.processes[0].memoryFormatted).toBe("1.0 KB");
  });

  it("formats memory in the KB tier without crossing into MB", () => {
    // 500 KB stays in KB (under 1024 KB = 1 MB)
    const app = mockApp([{ type: "Browser", pid: 100, cpu: 0, memoryKB: 500 }]);
    const result = auditProcesses(app);
    expect(result.processes[0].memoryFormatted).toBe("500.0 KB");
  });

  it("formats the 1 MB boundary as MB", () => {
    // 1024 KB = 1 MB exactly
    const app = mockApp([{ type: "Browser", pid: 100, cpu: 0, memoryKB: 1024 }]);
    const result = auditProcesses(app);
    expect(result.processes[0].memoryFormatted).toBe("1.0 MB");
  });

  it("formats the 1 GB boundary as GB", () => {
    // 1024 * 1024 KB = 1 GB exactly
    const app = mockApp([{ type: "Browser", pid: 100, cpu: 0, memoryKB: 1024 * 1024 }]);
    const result = auditProcesses(app);
    expect(result.processes[0].memoryFormatted).toBe("1.0 GB");
  });

  it("formats memory above 1 GB without falling back to MB", () => {
    // ~4 GB across renderers — a realistic load for a media-heavy Electron app
    const app = mockApp([
      { type: "Browser", pid: 100, cpu: 0, memoryKB: 1024 * 1024 },
      { type: "Renderer", pid: 200, cpu: 0, memoryKB: 1024 * 1024 },
      { type: "Renderer", pid: 300, cpu: 0, memoryKB: 1024 * 1024 },
      { type: "Renderer", pid: 400, cpu: 0, memoryKB: 1024 * 1024 },
    ]);
    const result = auditProcesses(app);
    expect(result.totalMemoryFormatted).toBe("4.0 GB");
  });

  it("treats a malformed workingSetSize as 0 instead of NaN", () => {
    const app = mockApp([{ type: "Browser", pid: 100, cpu: 0, memoryKB: Number.NaN }]);
    const result = auditProcesses(app);
    expect(result.processes[0].memory).toBe(0);
    expect(result.processes[0].memoryFormatted).toBe("0 B");
    expect(result.totalMemory).toBe(0);
    expect(result.totalMemoryFormatted).toBe("0 B");
  });

  it("promotes values just under the 1 MB boundary into the MB tier", () => {
    // 1023.99 KB would otherwise display as "1024.0 KB"
    const app = mockApp([{ type: "Browser", pid: 100, cpu: 0, memoryKB: 1023.99 }]);
    const result = auditProcesses(app);
    expect(result.processes[0].memoryFormatted).toBe("1.0 MB");
  });

  it("promotes values just under the 1 GB boundary into the GB tier", () => {
    // ~1023.9999 MB would otherwise display as "1024.0 MB"
    const app = mockApp([{ type: "Browser", pid: 100, cpu: 0, memoryKB: 1024 * 1024 - 0.1 }]);
    const result = auditProcesses(app);
    expect(result.processes[0].memoryFormatted).toBe("1.0 GB");
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
