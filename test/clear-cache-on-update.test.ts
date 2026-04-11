import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { clearCacheOnUpdate } from '../src/clear-cache-on-update';
import type { ElectronSession } from '../src/electron-types';

function mockSession() {
  const calls: string[] = [];
  return {
    calls,
    clearStorageData: (opts: { storages: string[] }) => {
      calls.push(`clearStorageData:${opts.storages.join(',')}`);
      return Promise.resolve();
    },
    clearCache: () => {
      calls.push('clearCache');
      return Promise.resolve();
    },
  } as ElectronSession & { calls: string[] };
}

describe('clearCacheOnUpdate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eo-cache-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('clears cache on first run (no version file)', async () => {
    const session = mockSession();
    const result = await clearCacheOnUpdate(tmpDir, '1.0.0', session);

    expect(result.versionChanged).toBe(true);
    expect(result.previousVersion).toBeNull();
    expect(result.currentVersion).toBe('1.0.0');
    expect(session.calls).toContain('clearStorageData:cachestorage');
    expect(session.calls).toContain('clearCache');

    // Version file should be written
    const written = fs.readFileSync(path.join(tmpDir, '.last-version'), 'utf-8');
    expect(written).toBe('1.0.0');
  });

  it('skips cache clearing when version unchanged', async () => {
    fs.writeFileSync(path.join(tmpDir, '.last-version'), '1.0.0');
    const session = mockSession();
    const result = await clearCacheOnUpdate(tmpDir, '1.0.0', session);

    expect(result.versionChanged).toBe(false);
    expect(result.previousVersion).toBe('1.0.0');
    expect(session.calls).toHaveLength(0);
  });

  it('clears cache when version changes', async () => {
    fs.writeFileSync(path.join(tmpDir, '.last-version'), '1.0.0');
    const session = mockSession();
    const result = await clearCacheOnUpdate(tmpDir, '2.0.0', session);

    expect(result.versionChanged).toBe(true);
    expect(result.previousVersion).toBe('1.0.0');
    expect(session.calls).toContain('clearCache');
  });

  it('respects clearCacheStorage: false', async () => {
    const session = mockSession();
    await clearCacheOnUpdate(tmpDir, '1.0.0', session, {
      clearCacheStorage: false,
    });

    expect(session.calls).not.toContain('clearStorageData:cachestorage');
    expect(session.calls).toContain('clearCache');
  });

  it('respects clearHttpCache: false', async () => {
    const session = mockSession();
    await clearCacheOnUpdate(tmpDir, '1.0.0', session, {
      clearHttpCache: false,
    });

    expect(session.calls).toContain('clearStorageData:cachestorage');
    expect(session.calls).not.toContain('clearCache');
  });

  it('uses custom version filename', async () => {
    const session = mockSession();
    await clearCacheOnUpdate(tmpDir, '1.0.0', session, {
      versionFilename: '.app-version',
    });

    expect(fs.existsSync(path.join(tmpDir, '.app-version'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.last-version'))).toBe(false);
  });
});
