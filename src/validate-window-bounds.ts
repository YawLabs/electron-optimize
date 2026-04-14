export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ValidateWindowBoundsOptions {
  /**
   * Default width as a fraction of the display width (0-1).
   * Used when saved bounds are off-screen or invalid. Default: 0.8
   */
  defaultWidthFraction?: number;

  /**
   * Default height as a fraction of the display height (0-1).
   * Used when saved bounds are off-screen or invalid. Default: 0.8
   */
  defaultHeightFraction?: number;

  /**
   * Minimum window width in pixels. Default: 400
   */
  minWidth?: number;

  /**
   * Minimum window height in pixels. Default: 300
   */
  minHeight?: number;
}

/**
 * Validates saved window bounds against a display's work area.
 *
 * When users save and restore window positions, the saved coordinates
 * can become invalid if a monitor is disconnected, resolution changes,
 * or DPI settings are adjusted. This function ensures the window is
 * always placed on a visible display.
 *
 * **How it works:**
 * 1. Checks if the saved position falls within the target display
 * 2. If on-screen: clamps to display edges (prevents partial off-screen)
 * 3. If off-screen: centers at 80% of display size (or custom fraction)
 * 4. Enforces minimum dimensions
 *
 * Use with Electron's `screen.getDisplayNearestPoint()` to find the
 * right display for saved or cursor coordinates.
 *
 * @param savedBounds - Previously saved window bounds (or null for new windows)
 * @param workArea - The target display's work area from Electron's `screen` API
 * @param options - Optional configuration
 * @returns Valid bounds guaranteed to be visible on the display
 *
 * @example
 * ```ts
 * import { validateWindowBounds } from 'electron-optimize';
 * import { screen } from 'electron';
 *
 * // Restoring a saved window
 * const saved = loadSavedBounds(); // { x, y, width, height } or null
 * const cursorPoint = screen.getCursorScreenPoint();
 * const targetPoint = saved ?? cursorPoint;
 * const display = screen.getDisplayNearestPoint(targetPoint);
 * const bounds = validateWindowBounds(saved, display.workArea);
 * const win = new BrowserWindow(bounds);
 *
 * // New window (no saved bounds) — centers on cursor's display
 * const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
 * const bounds = validateWindowBounds(null, display.workArea);
 * ```
 */
export function validateWindowBounds(
  savedBounds: WindowBounds | null | undefined,
  workArea: DisplayWorkArea,
  options?: ValidateWindowBoundsOptions,
): WindowBounds {
  const defaultWidthFrac = options?.defaultWidthFraction ?? 0.8;
  const defaultHeightFrac = options?.defaultHeightFraction ?? 0.8;
  const minW = options?.minWidth ?? 400;
  const minH = options?.minHeight ?? 300;

  const { x: dx, y: dy, width: dw, height: dh } = workArea;

  // Check if the saved position is actually on this display
  const savedOnScreen =
    savedBounds != null &&
    savedBounds.x >= dx &&
    savedBounds.x < dx + dw &&
    savedBounds.y >= dy &&
    savedBounds.y < dy + dh;

  // Use saved size only if the window was on this display and fits
  let width: number;
  let height: number;

  if (savedOnScreen && savedBounds!.width <= dw) {
    width = Math.max(savedBounds!.width, minW);
  } else {
    width = Math.min(Math.max(Math.round(dw * defaultWidthFrac), minW), dw);
  }

  if (savedOnScreen && savedBounds!.height <= dh) {
    height = Math.max(savedBounds!.height, minH);
  } else {
    height = Math.min(Math.max(Math.round(dh * defaultHeightFrac), minH), dh);
  }

  // Use saved position only if on-screen; otherwise center
  let x: number;
  let y: number;

  if (savedOnScreen) {
    // Clamp to display edges so the window can't partially overflow
    x = Math.max(dx, Math.min(savedBounds!.x, dx + dw - width));
    y = Math.max(dy, Math.min(savedBounds!.y, dy + dh - height));
  } else {
    x = Math.round(dx + (dw - width) / 2);
    y = Math.round(dy + (dh - height) / 2);
  }

  return { x, y, width, height };
}
