import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCacheOnUpdate } from "../src/clear-cache-on-update";
import type { ElectronSession } from "../src/electron-types";

function mockSession() {
  const calls: string[] = [];
  return {
    calls,
    clearStorageData: (opts: { storages: string[] }) => {
      calls.push(`clearStorageData:${opts.storages.join(",")}`);
      return Promise.resolve();
    },
    clearCache: () => {
      calls.push("clearCache");
      return Promise.resolve();
    },
  } as ElectronSession & { calls: string[] };
}

describe("clearCacheOnUpdate", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eo-cache-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("clears cache on first run (no version file)", async () => {
    const session = mockSession();
    const result = await clearCacheOnUpdate(tmpDir, "1.0.0", session);

    expect(result.versionChanged).toBe(true);
    expect(result.previousVersion).toBeNull();
    expect(result.currentVersion).toBe("1.0.0");
    expect(result.isFirstRun).toBe(true);
    expect(result.cleared).toBe(true);
    expect(result.recorded).toBe(true);
    expect(session.calls).toContain("clearStorageData:cachestorage");
    expect(session.calls).toContain("clearCache");

    // Version file should be written
    const written = fs.readFileSync(path.join(tmpDir, ".last-version"), "utf-8");
    expect(written).toBe("1.0.0");
  });

  it("skips cache clearing when version unchanged", async () => {
    fs.writeFileSync(path.join(tmpDir, ".last-version"), "1.0.0");
    const session = mockSession();
    const result = await clearCacheOnUpdate(tmpDir, "1.0.0", session);

    expect(result.versionChanged).toBe(false);
    expect(result.previousVersion).toBe("1.0.0");
    expect(result.isFirstRun).toBe(false);
    expect(result.cleared).toBe(true);
    expect(result.recorded).toBe(true);
    expect(session.calls).toHaveLength(0);
  });

  it("clears cache when version changes", async () => {
    fs.writeFileSync(path.join(tmpDir, ".last-version"), "1.0.0");
    const session = mockSession();
    const result = await clearCacheOnUpdate(tmpDir, "2.0.0", session);

    expect(result.versionChanged).toBe(true);
    expect(result.previousVersion).toBe("1.0.0");
    expect(result.isFirstRun).toBe(false);
    expect(session.calls).toContain("clearCache");
  });

  it("normalizes a whitespace-padded currentVersion so it does not re-clear every launch", async () => {
    const session = mockSession();
    const first = await clearCacheOnUpdate(tmpDir, " 1.2.3 ", session);
    expect(first.versionChanged).toBe(true);
    expect(first.currentVersion).toBe("1.2.3");

    const second = await clearCacheOnUpdate(tmpDir, " 1.2.3 ", mockSession());
    expect(second.versionChanged).toBe(false);
    expect(second.previousVersion).toBe("1.2.3");
  });

  it("respects clearCacheStorage: false", async () => {
    const session = mockSession();
    await clearCacheOnUpdate(tmpDir, "1.0.0", session, {
      clearCacheStorage: false,
    });

    expect(session.calls).not.toContain("clearStorageData:cachestorage");
    expect(session.calls).toContain("clearCache");
  });

  it("respects clearHttpCache: false", async () => {
    const session = mockSession();
    await clearCacheOnUpdate(tmpDir, "1.0.0", session, {
      clearHttpCache: false,
    });

    expect(session.calls).toContain("clearStorageData:cachestorage");
    expect(session.calls).not.toContain("clearCache");
  });

  it("does not record new version when a clear rejects (retries on next launch)", async () => {
    fs.writeFileSync(path.join(tmpDir, ".last-version"), "1.0.0");
    const failingSession: ElectronSession = {
      clearStorageData: () => Promise.reject(new Error("storage failed")),
      clearCache: () => Promise.resolve(),
    };

    const result = await clearCacheOnUpdate(tmpDir, "2.0.0", failingSession);

    expect(result.versionChanged).toBe(true);
    expect(result.cleared).toBe(false);
    expect(result.recorded).toBe(false);
    // Version file must still contain the old version so the next launch
    // re-attempts the clear.
    const written = fs.readFileSync(path.join(tmpDir, ".last-version"), "utf-8");
    expect(written).toBe("1.0.0");
  });

  it("reports recorded: false when the version-file write fails", async () => {
    fs.writeFileSync(path.join(tmpDir, ".last-version"), "1.0.0");
    const session = mockSession();
    const spy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {
      throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    });

    const result = await clearCacheOnUpdate(tmpDir, "2.0.0", session);
    spy.mockRestore();

    expect(result.versionChanged).toBe(true);
    expect(result.cleared).toBe(true);
    expect(result.recorded).toBe(false);
    // Old version stays on disk, so the next launch re-clears and retries.
    const written = fs.readFileSync(path.join(tmpDir, ".last-version"), "utf-8");
    expect(written).toBe("1.0.0");
  });

  it("records new version when all attempted clears succeed", async () => {
    fs.writeFileSync(path.join(tmpDir, ".last-version"), "1.0.0");
    const session = mockSession();

    await clearCacheOnUpdate(tmpDir, "2.0.0", session);

    const written = fs.readFileSync(path.join(tmpDir, ".last-version"), "utf-8");
    expect(written).toBe("2.0.0");
  });

  it("records new version when both clears are disabled (version tracking only)", async () => {
    fs.writeFileSync(path.join(tmpDir, ".last-version"), "1.0.0");
    const session = mockSession();

    const result = await clearCacheOnUpdate(tmpDir, "2.0.0", session, {
      clearCacheStorage: false,
      clearHttpCache: false,
    });

    expect(session.calls).toHaveLength(0);
    expect(result.cleared).toBe(true);
    expect(result.recorded).toBe(true);
    const written = fs.readFileSync(path.join(tmpDir, ".last-version"), "utf-8");
    expect(written).toBe("2.0.0");
  });

  it("uses custom version filename", async () => {
    const session = mockSession();
    await clearCacheOnUpdate(tmpDir, "1.0.0", session, {
      versionFilename: ".app-version",
    });

    expect(fs.existsSync(path.join(tmpDir, ".app-version"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".last-version"))).toBe(false);
  });
});
