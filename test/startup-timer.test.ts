import { describe, expect, it, vi } from "vitest";
import { createStartupTimer } from "../src/startup-timer";

describe("createStartupTimer", () => {
  it("records marks with increasing timestamps", () => {
    const timer = createStartupTimer();
    timer.mark("first");
    timer.mark("second");

    const marks = timer.getMarks();
    expect(marks).toHaveLength(2);
    expect(marks[0].label).toBe("first");
    expect(marks[1].label).toBe("second");
    expect(marks[1].ms).toBeGreaterThanOrEqual(marks[0].ms);
  });

  it("flush prints to console and resets", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const timer = createStartupTimer();
    timer.mark("test");
    timer.flush();

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("[startup]");
    expect(spy.mock.calls[0][0]).toContain("test");

    // Marks should be cleared
    expect(timer.getMarks()).toHaveLength(0);
    spy.mockRestore();
  });

  it("flush does nothing when no marks exist", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const timer = createStartupTimer();
    timer.flush();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("supports custom label", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const timer = createStartupTimer("boot");
    timer.mark("ready");
    timer.flush();
    expect(spy.mock.calls[0][0]).toContain("[boot]");
    spy.mockRestore();
  });

  it("flush output preserves the documented padded format", () => {
    // Pin hrtime so the formatted ms value is deterministic.
    let counter = 0n;
    const hrtimeSpy = vi.spyOn(process.hrtime, "bigint").mockImplementation(() => {
      const v = counter;
      counter += 1_500_000n; // +1.5 ms per call
      return v;
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const timer = createStartupTimer();
    timer.mark("first");
    timer.flush();

    // Expected line layout per the implementation:
    //   "  " + padStart(8) of ms.toFixed(1) + "ms  " + label
    // ms = (1_500_000 - 0) / 1e6 = 1.5 -> "1.5" -> "     1.5" (padded)
    // Full line: "       1.5ms  first" (2 + 8 + 2 + 2 + 5 = 19 chars)
    expect(consoleSpy.mock.calls[0][0]).toBe("[startup]\n       1.5ms  first");

    consoleSpy.mockRestore();
    hrtimeSpy.mockRestore();
  });

  it("measures marks recorded after flush from timer creation, not from the flush", () => {
    let counter = 0n;
    const hrtimeSpy = vi.spyOn(process.hrtime, "bigint").mockImplementation(() => {
      const v = counter;
      counter += 1_500_000n; // +1.5 ms per call
      return v;
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const timer = createStartupTimer(); // t0 = 0
    timer.mark("before flush"); // 1.5 ms
    timer.flush(); // resets marks, must NOT reset t0
    timer.mark("after flush"); // 3.0 ms

    expect(timer.getMarks()).toEqual([{ label: "after flush", ms: 3 }]);

    consoleSpy.mockRestore();
    hrtimeSpy.mockRestore();
  });

  it("getMarks is non-destructive and can be called repeatedly", () => {
    const timer = createStartupTimer();
    timer.mark("a");
    timer.mark("b");

    const first = timer.getMarks();
    const second = timer.getMarks();
    expect(first).toHaveLength(2);
    expect(second).toEqual(first);
  });

  it("reset clears marks without printing", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const timer = createStartupTimer();
    timer.mark("a");
    timer.mark("b");
    timer.reset();

    expect(timer.getMarks()).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
