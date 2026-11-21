import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ElectronPowerMonitor } from "../src/electron-types";
import { managePowerState } from "../src/manage-power-state";

function mockPowerMonitor() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    on(event: string, fn: () => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
    },
    removeListener(event: string, fn: () => void) {
      listeners.get(event)?.delete(fn);
    },
    emit(event: string) {
      for (const fn of listeners.get(event) ?? []) fn();
    },
    listenerCount(event: string) {
      return listeners.get(event)?.size ?? 0;
    },
  } as ElectronPowerMonitor & { emit: (e: string) => void; listenerCount: (e: string) => number };
}

describe("managePowerState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onSuspend when system suspends", () => {
    const pm = mockPowerMonitor();
    const onSuspend = vi.fn();
    const onResume = vi.fn();

    managePowerState(pm, { onSuspend, onResume });
    pm.emit("suspend");

    expect(onSuspend).toHaveBeenCalledOnce();
    expect(onResume).not.toHaveBeenCalled();
  });

  it("delays onResume by default (5 seconds)", () => {
    const pm = mockPowerMonitor();
    const onResume = vi.fn();

    managePowerState(pm, { onSuspend: vi.fn(), onResume });
    pm.emit("resume");

    expect(onResume).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(onResume).toHaveBeenCalledOnce();
  });

  it("respects custom resumeDelayMs", () => {
    const pm = mockPowerMonitor();
    const onResume = vi.fn();

    managePowerState(pm, { onSuspend: vi.fn(), onResume }, { resumeDelayMs: 1000 });
    pm.emit("resume");

    vi.advanceTimersByTime(999);
    expect(onResume).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onResume).toHaveBeenCalledOnce();
  });

  it("calls onResume immediately when delay is 0", () => {
    const pm = mockPowerMonitor();
    const onResume = vi.fn();

    managePowerState(pm, { onSuspend: vi.fn(), onResume }, { resumeDelayMs: 0 });
    pm.emit("resume");

    expect(onResume).toHaveBeenCalledOnce();
  });

  it("cancels pending resume on rapid suspend/resume cycle", () => {
    const pm = mockPowerMonitor();
    const onSuspend = vi.fn();
    const onResume = vi.fn();

    managePowerState(pm, { onSuspend, onResume });

    // Resume, then immediately suspend again before delay fires
    pm.emit("resume");
    vi.advanceTimersByTime(2000); // Partially through the 5s delay
    pm.emit("suspend");

    // The pending resume should be cancelled
    vi.advanceTimersByTime(10000);
    expect(onResume).not.toHaveBeenCalled();
    expect(onSuspend).toHaveBeenCalledTimes(1);
  });

  it("collapses back-to-back resume events into a single onResume", () => {
    const pm = mockPowerMonitor();
    const onResume = vi.fn();

    managePowerState(pm, { onSuspend: vi.fn(), onResume });

    pm.emit("resume");
    vi.advanceTimersByTime(2000);
    // A second resume arrives before the first delay elapses (e.g. OS
    // re-fires the event after a brief disconnect). The pending timeout
    // should be replaced, not stacked.
    pm.emit("resume");
    vi.advanceTimersByTime(5000);

    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("cleanup removes all listeners", () => {
    const pm = mockPowerMonitor();
    const cleanup = managePowerState(pm, { onSuspend: vi.fn(), onResume: vi.fn() });

    expect(pm.listenerCount("suspend")).toBe(1);
    expect(pm.listenerCount("resume")).toBe(1);

    cleanup();

    expect(pm.listenerCount("suspend")).toBe(0);
    expect(pm.listenerCount("resume")).toBe(0);
  });

  it("cleanup cancels pending resume timeout", () => {
    const pm = mockPowerMonitor();
    const onResume = vi.fn();
    const cleanup = managePowerState(pm, { onSuspend: vi.fn(), onResume });

    pm.emit("resume");
    cleanup();
    vi.advanceTimersByTime(10000);

    expect(onResume).not.toHaveBeenCalled();
  });

  it("re-arms the resume timeout after a full sleep/wake cycle", () => {
    const pm = mockPowerMonitor();
    const onSuspend = vi.fn();
    const onResume = vi.fn();

    managePowerState(pm, { onSuspend, onResume });

    // First wake: delay elapses and onResume fires.
    pm.emit("resume");
    vi.advanceTimersByTime(5000);
    expect(onResume).toHaveBeenCalledTimes(1);

    // Second full cycle: suspend cancels nothing (timeout already fired),
    // then resume must schedule a NEW timeout.
    pm.emit("suspend");
    expect(onSuspend).toHaveBeenCalledTimes(1);
    pm.emit("resume");
    expect(onResume).toHaveBeenCalledTimes(1); // not yet -- delay pending
    vi.advanceTimersByTime(5000);

    expect(onResume).toHaveBeenCalledTimes(2);
    expect(onSuspend).toHaveBeenCalledTimes(1);
  });

  it("cleanup is idempotent when called multiple times", () => {
    const pm = mockPowerMonitor();
    const onSuspend = vi.fn();
    const onResume = vi.fn();
    const cleanup = managePowerState(pm, { onSuspend, onResume });

    // Emit events first so cleanup runs against a live listener set.
    pm.emit("suspend");
    pm.emit("resume");
    expect(pm.listenerCount("suspend")).toBe(1);
    expect(pm.listenerCount("resume")).toBe(1);

    expect(() => cleanup()).not.toThrow();
    expect(pm.listenerCount("suspend")).toBe(0);
    expect(pm.listenerCount("resume")).toBe(0);

    expect(() => cleanup()).not.toThrow();
    expect(pm.listenerCount("suspend")).toBe(0);
    expect(pm.listenerCount("resume")).toBe(0);

    // Events after cleanup are ignored, and the cancelled timeout stays dead.
    pm.emit("suspend");
    pm.emit("resume");
    vi.advanceTimersByTime(10000);
    expect(onSuspend).toHaveBeenCalledTimes(1);
    expect(onResume).not.toHaveBeenCalled();
  });
});
