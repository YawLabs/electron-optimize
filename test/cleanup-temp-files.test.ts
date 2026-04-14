import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupTempFiles } from "../src/cleanup-temp-files";

describe("cleanupTempFiles", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eo-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("removes .tmp files from Network/ and Session Storage/", () => {
    const networkDir = path.join(tmpDir, "Network");
    const sessionDir = path.join(tmpDir, "Session Storage");
    fs.mkdirSync(networkDir);
    fs.mkdirSync(sessionDir);

    fs.writeFileSync(path.join(networkDir, "cache.tmp"), "");
    fs.writeFileSync(path.join(networkDir, "valid.dat"), "");
    fs.writeFileSync(path.join(sessionDir, "LOG.old001.TMP"), "");
    fs.writeFileSync(path.join(sessionDir, "CURRENT"), "");

    const removed = cleanupTempFiles(tmpDir);

    expect(removed).toBe(2);
    expect(fs.existsSync(path.join(networkDir, "cache.tmp"))).toBe(false);
    expect(fs.existsSync(path.join(networkDir, "valid.dat"))).toBe(true);
    expect(fs.existsSync(path.join(sessionDir, "LOG.old001.TMP"))).toBe(false);
    expect(fs.existsSync(path.join(sessionDir, "CURRENT"))).toBe(true);
  });

  it("handles case-insensitive extensions", () => {
    const dir = path.join(tmpDir, "Network");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "a.TMP"), "");
    fs.writeFileSync(path.join(dir, "b.Tmp"), "");
    fs.writeFileSync(path.join(dir, "c.tmp"), "");

    const removed = cleanupTempFiles(tmpDir);
    expect(removed).toBe(3);
  });

  it("returns 0 when directories do not exist", () => {
    const removed = cleanupTempFiles(path.join(tmpDir, "nonexistent"));
    expect(removed).toBe(0);
  });

  it("returns 0 when no temp files exist", () => {
    const dir = path.join(tmpDir, "Network");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "keep.dat"), "");

    const removed = cleanupTempFiles(tmpDir);
    expect(removed).toBe(0);
  });

  it("accepts custom subdirs and extensions", () => {
    const customDir = path.join(tmpDir, "CustomCache");
    fs.mkdirSync(customDir);
    fs.writeFileSync(path.join(customDir, "old.bak"), "");
    fs.writeFileSync(path.join(customDir, "old.log"), "");

    const removed = cleanupTempFiles(tmpDir, {
      subdirs: ["CustomCache"],
      extensions: [".bak"],
    });

    expect(removed).toBe(1);
    expect(fs.existsSync(path.join(customDir, "old.bak"))).toBe(false);
    expect(fs.existsSync(path.join(customDir, "old.log"))).toBe(true);
  });
});
