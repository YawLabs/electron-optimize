# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.1.0]: https://github.com/YawLabs/electron-optimize/releases/tag/v1.1.0
[1.0.2]: https://github.com/YawLabs/electron-optimize/releases/tag/v1.0.2
[1.0.1]: https://github.com/YawLabs/electron-optimize/releases/tag/v1.0.1
[1.0.0]: https://github.com/YawLabs/electron-optimize/releases/tag/v1.0.0
