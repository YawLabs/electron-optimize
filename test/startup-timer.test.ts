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
