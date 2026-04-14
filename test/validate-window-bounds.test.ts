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

  it("clamps window to display size when display is smaller than minWidth", () => {
    const tinyDisplay = { x: 0, y: 0, width: 300, height: 200 };
    const bounds = validateWindowBounds(null, tinyDisplay);
    // Should not exceed display dimensions even though minWidth=400
    expect(bounds.width).toBeLessThanOrEqual(300);
    expect(bounds.height).toBeLessThanOrEqual(200);
  });
});
