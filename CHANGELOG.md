# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `validateWindowBounds`: saved-on-screen bounds are now capped at the
  display size when `minWidth` / `minHeight` exceed the display. Previously
  only the centered (no/off-screen saved bounds) path applied the cap, so a
  display smaller than the minimums could yield a window larger than the
  display. The JSDoc had promised this cap all along.
- `auditProcesses`: a malformed `workingSetSize` from `getAppMetrics()` is
  treated as 0 instead of producing `NaN` memory values and `"NaN GB"`
  formatted strings.
- `auditProcesses`: formatted values just under a unit boundary no longer
  render as `1024.0 KB` / `1024.0 MB`; the tier is chosen by the displayed
  (rounded) value, so they promote to `1.0 MB` / `1.0 GB`.
- `clearCacheOnUpdate`: `currentVersion` is trimmed before comparing and
  writing, matching the trimmed read-back. A whitespace-padded version
  string previously re-cleared caches on every launch.
- `release.sh`: changelog extraction now stops at the link-reference block,
  so releasing the last (or only) section in CHANGELOG.md no longer bleeds
  `[x.y.z]: https://...` lines into the GitHub release notes.
- `release.sh`: the already-published check queries the exact version
  (`npm view pkg@version`) instead of the `latest` dist-tag, so re-running
  an interrupted release for an older version skips publish correctly.

### Changed

- `clearCacheOnUpdate` result now includes `isFirstRun` (distinguish fresh
  install from upgrade), `cleared` (all attempted clears succeeded), and
  `recorded` (the version file now holds `currentVersion`). The documented
  example guards its "Updated from X to Y" log with `!result.isFirstRun`.
- `auditProcesses`: `ProcessInfo.cpu` documentation no longer claims a
  0-100 range; Electron reports ~100 per fully-utilized core on
  macOS/Linux.
- `electron` peer dependency is now optional (`peerDependenciesMeta`).
  The library only ever receives Electron objects as arguments, and npm 7+
  auto-installed the ~100 MB Electron binary for consumers who did not
  already have it.
- Published packages now include `src/` so the shipped sourcemaps and
  declaration maps resolve.
- `index.ts` re-exports the `AppMetrics`, `AppMetricsCpu`, and
  `AppMetricsMemory` types.
- Release pipeline (`release.yml`) now runs lint and typecheck before
  publishing, matching the PR CI gates.
- `CONTRIBUTING.md` pre-commit checklist now includes `npm run typecheck`
  (a CI gate that `build` + `test` alone do not cover), and the
  supported-versions policy no longer claims active testing against real
  Electron binaries.
- `biome.json` `files.includes` narrowed to `src/**` and `test/**` to match
  what the lint scripts actually check.

## [1.2.0] - 2026-05-16

### Changed

- `auditProcesses`: `memoryFormatted` and `totalMemoryFormatted` now render
  values >= 1 GB in the GB tier (e.g. `4.0 GB`) instead of overflowing the
  MB tier (`4096.0 MB`). The numeric `memory` / `totalMemory` fields are
  unchanged. If you parse the formatted strings, expect the unit suffix to
  switch at the 1 GB boundary.

## [1.1.1] - 2026-05-16

### Fixed

- `managePowerState`: back-to-back `resume` events (no intervening
  `suspend`) no longer stack timeouts and double-invoke `onResume`. The
  pending resume timeout is now cleared before scheduling a new one.
- `clearCacheOnUpdate`: a transient failure in `clearCache` or
  `clearStorageData` no longer writes the new version to disk. The old
  version is preserved so the next launch retries the clears, instead of
  silently skipping them forever.
- JSDoc `@example` blocks across all modules now import from the correct
  `@yawlabs/electron-optimize` scope (previously the unscoped name).
  Visible in editor hover info from the published `.d.ts` files.
- `validateWindowBounds` JSDoc now notes that `minWidth` / `minHeight` are
  capped at the display size (the behavior was already correct and tested,
  the doc was misleading).

## [1.1.0] - 2026-04-13

### Changed

- **Dropped Node 18 support.** Node 18 hit EOL on 2025-04-30 and has been
  unsupported for a year. `engines.node` is now `>=20.0.0` and the CI matrix
  tests Node 20 and 22.
- Upgraded `tsconfig.json` to `module: node16` / `moduleResolution: node16`
  with explicit `types: ["node"]`, for compatibility with TypeScript 6+.
- Upgraded dev dependencies: TypeScript 5.7 → 6, vitest 3 → 4,
  `@types/node` pinned explicitly (previously pulled in transitively).

### Added

- Supported-versions policy documented in `CONTRIBUTING.md`: supported Node
  versions track Electron's support matrix rather than Node's LTS calendar.

## [1.0.2] - 2026-04-13

No functional changes. Tooling and metadata only.

### Changed

- Bumped minimum Node version from 16 to 18 to match the tested CI matrix.
- Reformatted source with Biome (double quotes, organized imports); no
  runtime or API changes.

### Added

- Biome lint/format config and `lint` / `lint:fix` / `typecheck` scripts,
  wired into CI.
- `CHANGELOG.md`, `SECURITY.md`, `.nvmrc`, and Dependabot config.
- `bugs.url` field in `package.json`.

## [1.0.1] - 2026-04-11

### Fixed

- Repository URL casing in `package.json` to match GitHub's canonical casing,
  fixing npm provenance verification.

## [1.0.0] - 2026-04-11

### Added

- `cleanupTempFiles` — removes stale `.tmp` files from Chromium's `Network/`
  and `Session Storage/` directories.
- `clearCacheOnUpdate` — clears HTTP cache and CacheStorage on version bump.
- `validateWindowBounds` — guarantees window bounds fall on a visible display,
  with clamping and minimum-size enforcement.
- `createStartupTimer` — high-precision startup milestone tracking using
  `process.hrtime.bigint()`.
- `managePowerState` — pause/resume lifecycle around OS suspend/resume, with
  a configurable post-wake delay.
- `auditProcesses` — per-process CPU and memory breakdown for Electron's
  child processes.

[Unreleased]: https://github.com/YawLabs/electron-optimize/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/YawLabs/electron-optimize/releases/tag/v1.2.0
[1.1.1]: https://github.com/YawLabs/electron-optimize/releases/tag/v1.1.1
[1.1.0]: https://github.com/YawLabs/electron-optimize/releases/tag/v1.1.0
[1.0.2]: https://github.com/YawLabs/electron-optimize/releases/tag/v1.0.2
[1.0.1]: https://github.com/YawLabs/electron-optimize/releases/tag/v1.0.1
[1.0.0]: https://github.com/YawLabs/electron-optimize/releases/tag/v1.0.0
