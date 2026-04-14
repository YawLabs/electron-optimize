/**
 * A mark recorded by the startup timer.
 */
export interface StartupMark {
  /** Label describing the milestone */
  label: string;
  /** Milliseconds elapsed since timer creation */
  ms: number;
}

/**
 * Creates a startup timer for measuring initialization milestones.
 *
 * Uses `process.hrtime.bigint()` for sub-millisecond precision. Each call
 * to `mark()` records a labeled timestamp. Call `flush()` to print all
 * marks and reset, or `getMarks()` to read them programmatically.
 *
 * Zero overhead when marks aren't read — timestamps are just pushed
 * to an array.
 *
 * @returns Timer object with `mark`, `flush`, and `getMarks` methods
 *
 * @example
 * ```ts
 * import { createStartupTimer } from 'electron-optimize';
 *
 * const timer = createStartupTimer();
 *
 * // At the top of your main process
 * import { app } from 'electron';
 * timer.mark('imports done');
 *
 * app.whenReady().then(() => {
 *   timer.mark('app ready');
 *   createWindow();
 *   timer.mark('window created');
 * });
 *
 * // In ready-to-show handler
 * win.once('ready-to-show', () => {
 *   timer.mark('ready-to-show');
 *   timer.flush(); // Prints all marks to console
 *   win.show();
 * });
 *
 * // Output:
 * // [startup]
 * //      45.2ms  imports done
 * //     312.7ms  app ready
 * //     318.4ms  window created
 * //     487.1ms  ready-to-show
 * ```
 */
export function createStartupTimer(label = "startup") {
  const t0 = process.hrtime.bigint();
  const marks: [string, bigint][] = [];

  return {
    /**
     * Record a named milestone.
     */
    mark(name: string): void {
      marks.push([name, process.hrtime.bigint()]);
    },

    /**
     * Print all marks to console and reset.
     * Output format matches `--enable-logging` conventions.
     */
    flush(): void {
      if (marks.length === 0) return;
      const lines = marks.map(([name, ts]) => {
        const ms = Number(ts - t0) / 1e6;
        return `  ${ms.toFixed(1).padStart(8)}ms  ${name}`;
      });
      console.log(`[${label}]\n${lines.join("\n")}`);
      marks.length = 0;
    },

    /**
     * Get all marks as structured data (without resetting).
     */
    getMarks(): StartupMark[] {
      return marks.map(([name, ts]) => ({
        label: name,
        ms: Number(ts - t0) / 1e6,
      }));
    },

    /**
     * Reset all marks without printing.
     */
    reset(): void {
      marks.length = 0;
    },
  };
}
