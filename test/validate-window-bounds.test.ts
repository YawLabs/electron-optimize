import { describe, expect, it } from "vitest";
import { validateWindowBounds } from "../src/validate-window-bounds";

const DISPLAY = { x: 0, y: 0, width: 1920, height: 1080 };

describe("validateWindowBounds", () => {
  it("centers a new window at 80% of display size by default", () => {
    const bounds = validateWindowBounds(null, DISPLAY);
    expect(bounds.width).toBe(1536); // 1920 * 0.8
    expect(bounds.height).toBe(864); // 1080 * 0.8
    expect(bounds.x).toBe(192); // (1920 - 1536) / 2
    expect(bounds.y).toBe(108); // (1080 - 864) / 2
  });

  it("restores saved bounds when on-screen", () => {
    const saved = { x: 100, y: 50, width: 800, height: 600 };
    const bounds = validateWindowBounds(saved, DISPLAY);
    expect(bounds).toEqual(saved);
  });

  it("clamps saved bounds that overflow the display edge", () => {
    const saved = { x: 1800, y: 900, width: 800, height: 600 };
    const bounds = validateWindowBounds(saved, DISPLAY);
    // x should be clamped: max(0, min(1800, 1920-800)) = 1120
    expect(bounds.x).toBe(1120);
    // y should be clamped: max(0, min(900, 1080-600)) = 480
    expect(bounds.y).toBe(480);
  });

  it("centers when saved position is off-screen (monitor disconnected)", () => {
    const saved = { x: 3000, y: 500, width: 800, height: 600 };
    const bounds = validateWindowBounds(saved, DISPLAY);
    // Saved x=3000 is outside display (0..1920), so falls back to center
    expect(bounds.width).toBe(Math.round(1920 * 0.8));
    expect(bounds.height).toBe(Math.round(1080 * 0.8));
    expect(bounds.x).toBe(Math.round((1920 - bounds.width) / 2));
    expect(bounds.y).toBe(Math.round((1080 - bounds.height) / 2));
  });

  it("handles secondary display with offset origin", () => {
    const secondDisplay = { x: 1920, y: 0, width: 2560, height: 1440 };
    const saved = { x: 2000, y: 100, width: 1200, height: 900 };
    const bounds = validateWindowBounds(saved, secondDisplay);
    expect(bounds).toEqual(saved);
  });

  it("enforces minimum dimensions", () => {
    const saved = { x: 100, y: 100, width: 200, height: 100 };
    const bounds = validateWindowBounds(saved, DISPLAY);
    expect(bounds.width).toBe(400); // minWidth default
    expect(bounds.height).toBe(300); // minHeight default
  });

  it("respects custom default size fraction", () => {
    const bounds = validateWindowBounds(null, DISPLAY, {
      defaultWidthFraction: 0.5,
      defaultHeightFraction: 0.6,
    });
    expect(bounds.width).toBe(960); // 1920 * 0.5
    expect(bounds.height).toBe(648); // 1080 * 0.6
  });

  it("handles display with negative origin (left of primary)", () => {
    const leftDisplay = { x: -1920, y: 0, width: 1920, height: 1080 };
    const saved = { x: -1500, y: 200, width: 800, height: 600 };
    const bounds = validateWindowBounds(saved, leftDisplay);
    expect(bounds).toEqual(saved);
  });

  it("handles display above primary (negative y)", () => {
    const topDisplay = { x: 0, y: -1080, width: 1920, height: 1080 };
    const saved = { x: 100, y: -900, width: 800, height: 600 };
    const bounds = validateWindowBounds(saved, topDisplay);
    expect(bounds).toEqual(saved);
  });

  it("rejects saved bounds from a different display", () => {
    const primaryDisplay = { x: 0, y: 0, width: 1920, height: 1080 };
    // These bounds were on a second monitor at x=1920
    const saved = { x: 2100, y: 200, width: 800, height: 600 };
    const bounds = validateWindowBounds(saved, primaryDisplay);
    // Should not use saved position — center instead
    expect(bounds.x).toBe(Math.round((1920 - bounds.width) / 2));
  });

  it("falls back to fraction size when saved width exceeds display", () => {
    // Saved on this display but wider than it (e.g. restored from a 4K monitor)
    const saved = { x: 100, y: 100, width: 2400, height: 600 };
    const bounds = validateWindowBounds(saved, DISPLAY);
    // Width should drop back to the fraction default
    expect(bounds.width).toBe(Math.round(1920 * 0.8));
    // Height was reasonable, kept as saved
    expect(bounds.height).toBe(600);
    // Saved x is still in range after the new width: max(0, min(100, 1920-1536)) = 100
    expect(bounds.x).toBe(100);
    expect(bounds.y).toBe(100);
  });

  it("falls back to fraction size when saved height exceeds display", () => {
    const saved = { x: 100, y: 100, width: 800, height: 1500 };
    const bounds = validateWindowBounds(saved, DISPLAY);
    expect(bounds.width).toBe(800);
    expect(bounds.height).toBe(Math.round(1080 * 0.8));
    expect(bounds.y).toBe(100);
  });

  it("treats undefined saved bounds the same as null", () => {
    const bounds = validateWindowBounds(undefined, DISPLAY);
    expect(bounds.width).toBe(Math.round(1920 * 0.8));
    expect(bounds.height).toBe(Math.round(1080 * 0.8));
    expect(bounds.x).toBe(Math.round((1920 - bounds.width) / 2));
    expect(bounds.y).toBe(Math.round((1080 - bounds.height) / 2));
  });

  it("respects custom minWidth and minHeight", () => {
    const saved = { x: 100, y: 100, width: 500, height: 400 };
    const bounds = validateWindowBounds(saved, DISPLAY, {
      minWidth: 800,
      minHeight: 600,
    });
    expect(bounds.width).toBe(800);
    expect(bounds.height).toBe(600);
  });

  it("clamps window to display size when display is smaller than minWidth", () => {
    const tinyDisplay = { x: 0, y: 0, width: 300, height: 200 };
    const bounds = validateWindowBounds(null, tinyDisplay);
    // Should not exceed display dimensions even though minWidth=400
    expect(bounds.width).toBeLessThanOrEqual(300);
    expect(bounds.height).toBeLessThanOrEqual(200);
  });

  it("caps saved-on-screen bounds at the display size when minimums exceed the display", () => {
    const tinyDisplay = { x: 0, y: 0, width: 300, height: 200 };
    // Saved bounds fit the display, but the default minWidth (400) and
    // minHeight (300) do not — the cap must win over the minimum.
    const saved = { x: 10, y: 10, width: 250, height: 150 };
    const bounds = validateWindowBounds(saved, tinyDisplay);
    expect(bounds.width).toBe(300);
    expect(bounds.height).toBe(200);
    expect(bounds.x).toBe(0);
    expect(bounds.y).toBe(0);
  });

  it("caps saved-on-screen bounds with custom minimums larger than the display", () => {
    const display = { x: 0, y: 0, width: 640, height: 480 };
    const saved = { x: 0, y: 0, width: 600, height: 400 };
    const bounds = validateWindowBounds(saved, display, { minWidth: 800, minHeight: 600 });
    expect(bounds.width).toBe(640);
    expect(bounds.height).toBe(480);
  });
});
