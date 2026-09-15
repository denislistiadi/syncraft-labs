---
title: "Changelog"
description: Release history, version migration notes, and upgrades for Syncraft Labs.
head:
  - tag: meta
    attrs:
      name: keywords
      content: syncraft changelog, release notes, local-first state, react vue sync, semver
---

All notable changes to Syncraft Labs across core libraries and framework adapters (`@syncraft-labs/core`, `@syncraft-labs/react`, `@syncraft-labs/vue`).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.6.0] — 2026-09-15

> **Focus**: Pluggable conflict resolution strategies, cross-browser storage quota recovery, and long-term CRDT architectural roadmap. Zero breaking changes.

### Added

- **Core**: Added pluggable conflict resolution engine (`resolveConflict`) supporting `"lastWriteWins"` (default) and `"custom"` three-way merge algorithms (`base`, `local`, `remote`). ([#17](https://github.com/denislistiadi/syncraft-labs/issues/17))
- **Core**: Added `applyRemoteState(remote)` method on `BaseStoreController` for applying server push, WebSocket, or polling updates with automatic local patch reconciliation. ([#17](https://github.com/denislistiadi/syncraft-labs/issues/17))
- **Core**: Added conflict resolution types: `ConflictStrategy`, `ConflictInfo<T>`, `ConflictResolver<T>`, and `ConflictResolvedInfo`.
- **Core**: Added `conflictStrategy`, `resolver`, and `onConflictResolved` configuration options to `BaseSyncStoreConfig`.
- **React**: Exposed `conflictStrategy`, `resolver`, and `onConflictResolved` options in `UseSyncOptions<T>`, and exposed `applyRemoteState(remote)` action in `UseSyncReturn<T>`.
- **Vue**: Exposed `conflictStrategy`, `resolver`, and `onConflictResolved` options in `UseSyncOptions<T>`, and exposed `applyRemoteState(remote)` action in `UseSyncReturn<T>`.
- **Docs**: Added dedicated [Conflict Resolution Guide](/guides/conflict-resolution/) with comprehensive three-way merge, WebSocket, and real-time synchronization patterns.
- **Docs**: Published [RFC-001: CRDT Evaluation](/reference/crdt-evaluation/) evaluating CRDTs vs JSON Patches and specifying the post-v1.0 optional plugin architecture. ([#18](https://github.com/denislistiadi/syncraft-labs/issues/18))
- **Core**: Added `onQuotaExceeded` configuration callback option to `BaseSyncStoreConfig` for receiving storage quota exhaustion telemetry. ([#19](https://github.com/denislistiadi/syncraft-labs/issues/19))
- **Core**: Added `isQuotaExceededError()` cross-browser utility and `withQuotaGuard` storage wrapper to automatically detect IndexedDB quota limits and rollback optimistic state. ([#19](https://github.com/denislistiadi/syncraft-labs/issues/19))
- **Core**: Added `QuotaExceededInfo` and `QuotaExceededHandler` type definitions. ([#19](https://github.com/denislistiadi/syncraft-labs/issues/19))
- **React**: Exposed `onQuotaExceeded` option in `UseSyncOptions<T>`, and exported `isQuotaExceededError` utility. ([#19](https://github.com/denislistiadi/syncraft-labs/issues/19))
- **Vue**: Exposed `onQuotaExceeded` option in `UseSyncOptions<T>`, and exported `isQuotaExceededError` utility. ([#19](https://github.com/denislistiadi/syncraft-labs/issues/19))
- **Docs**: Added dedicated [Storage Quota Handling Guide](/guides/storage-quota/) covering browser disk thresholds, error handling, telemetry, and mitigation strategies. ([#19](https://github.com/denislistiadi/syncraft-labs/issues/19))

### Fixed

- **Core**: Raw `QuotaExceededError` DOMExceptions during IndexedDB writes or outbox pushes are now gracefully intercepted, optimistic in-memory state is automatically rolled back, and errors are normalized into typed `SyncraftError` (`source: "store"`, `retryable: false`). ([#19](https://github.com/denislistiadi/syncraft-labs/issues/19))

### Removed

- **Core**: Removed misleading `"crdt"` keyword from `packages/core/package.json` package metadata. ([#18](https://github.com/denislistiadi/syncraft-labs/issues/18))

### Upgrade

```bash
npm install @syncraft-labs/core@0.6.0 @syncraft-labs/react@0.6.0 @syncraft-labs/vue@0.6.0
```

---

## [0.5.0] — 2026-09-08

> **Focus**: Native Map and Set support in draft state, explicit unsupported-type detection, adapter reliability overhaul, and patch-correctness proofs.

### Added

- **Core**: Added Map and Set support in draft state with dedicated proxy handlers. Map operations (`set`, `delete`, `clear`) and Set operations (`add`, `delete`, `clear`) generate granular patches reusing `replace`/`add`/`remove` with `$entries` and `$values` path conventions (keys/values restricted to `string | number`). Hybrid `structuredClone` + fallback preserves `Date`/`Map`/`Set` for `applyPatches`. ([#13](https://github.com/denislistiadi/syncraft-labs/issues/13))
- **Core**: Added `fast-check` for property-based testing of Map and Set patch reversibility.
- **Core**: Added `SyncraftError` class extending `Error` with structured metadata (`source: "sync" | "fetch" | "hydration" | "store"`, `retryable: boolean`, and `cause`), plus `toSyncraftError()` normalization helper. Exported from `@syncraft-labs/core`, `@syncraft-labs/react`, and `@syncraft-labs/vue`.
- **React & Vue**: Refactored `useSync` lifecycle with singleton `StoreController` per store key. Deduplicates hydration, initial fetch, and background sync loops across multiple components sharing a storage key. ([#38](https://github.com/denislistiadi/syncraft-labs/issues/38))
- **React & Vue**: Added in-flight sync loop mutex and single-snapshot compaction (`compactOutbox(rawOutbox)`) to prevent outbox re-read windows and overlapping reconnect push race conditions. ([#39](https://github.com/denislistiadi/syncraft-labs/issues/39))
- **React & Vue**: Added reactive options support and fixed cross-clearing bug where background sync success previously cleared unrelated fetch or hydration errors. ([#40](https://github.com/denislistiadi/syncraft-labs/issues/40))
- **React & Vue**: Clarified and documented error contracts: `update()` operates as fire-and-forget (swallowing errors into `error` state), while `refetch()` throws on failure for imperative error handling while setting `error` state. ([#40](https://github.com/denislistiadi/syncraft-labs/issues/40))
- **React**: Fixed `useSyncSuspense` infinite throw loop upon hydration rejection by caching errors, throwing directly to Error Boundaries, and guarding against `undefined` data. ([#41](https://github.com/denislistiadi/syncraft-labs/issues/41))
- **Core**: Added `validateStateShape()` utility for explicit detection of unsupported types (Date, Map, Set, custom class instances, RegExp) in state trees.
- **Core**: Added and exported `isUnsupportedType()` utility for querying whether a value is unsupported for state persistence and proxy drafting.
- **Core**: Added general property-based test suite asserting `applyPatches(base, patches)` equals `nextState` and inverse-patch reversibility over 1,000 randomized iterations. ([#15](https://github.com/denislistiadi/syncraft-labs/issues/15))
- **Core**: Optimized array `shallowCopy` to use `target.slice()` with benchmark coverage and `ADR-001` decision record; added `Map`/`Set` parent-copy guards in `markChanged`. ([#16](https://github.com/denislistiadi/syncraft-labs/issues/16))

---

## [0.4.2] — 2026-08-22

### Security

- **Core**: Evicted PolinRider malware artifacts from all build configurations, core assets, and package entry points.
- **Project**: Conducted a full build integrity audit from an isolated, verified clean environment.
- **Infrastructure**: Hardened account security by rotating all internal NPM publishing tokens and enforcing mandatory Two-Factor Authentication (2FA) for all subsequent package releases.

---

## [0.4.1] — 2026-08-22 (Withdrawn)

> [!CAUTION]
> This version was compromised by a supply-chain attack associated with the PolinRider malware campaign and was immediately deprecated and pulled from active distribution on npm. Do not install or depend on this version.

---

## [0.4.0] — 2026-08-21

### Changed

- **BREAKING (Core)**: `OutboxEntry<T>` no longer includes a `snapshot` field. Outbox entries now store only `patches` and `inversePatches`, reducing storage size by >80% for large state. If your `pusher` function relied on `entry.snapshot`, use `store.getSnapshot()` instead or reconstruct state via `applyPatches()`.

### Added

- **Core**: Added circular reference detection during state proxy traversal, draft mutations, and store hydration in development mode.
- **Core**: Added deep-freeze protection for in-memory state in development mode (`NODE_ENV !== "production"`).
- **Core**: Added `overflowStrategy: "reject" | "dropOldest" | "forceFlush"` configuration option to `createSyncStore` (default `"reject"`).
- **Core**: Added `onOverflow` callback option to `createSyncStore` to receive outbox overflow event details (`OutboxOverflowInfo`).
- **Core**: Added `compactOutbox()` method to `SyncStore` and standalone `compactOutbox()` utility function.
- **Core**: Added `applyPatches<T>(base, patches)` utility function for applying Immer-style JSON patches to a state object.
- **Core**: Added `storageMode: "document" | "collection"` configuration option to `createSyncStore`.
- **React & Vue**: Exposed `overflowStrategy`, `onOverflow`, `maxOutboxSize`, `storageMode`, and `idField` in `UseSyncOptions`.

---

## [0.3.0] — 2026-08-02

### Changed

- **Core**: Replaced `immer` dependency with a custom, lightweight proxy-based implementation to reduce bundle size and improve enterprise integration.
- **Types**: Changed the generic state constraint in `createSyncStore` and hooks from `T extends object` to `T extends Record<string, unknown> | any[]` for stricter plain-object adherence.
- **Docs**: Migrated documentation site from Docusaurus to Astro Starlight to resolve indexing issues with zero-JS static output.

---

## [0.2.1] — 2026-07-20

### Changed

- **Docs**: Restructured the documentation site with dedicated Core Concepts and Getting Started pages.
- **Docs**: Added 7 comprehensive Production Guides (SSR, Architecture, Error Handling, Sync Strategies, Cross-Tab Sync, and Testing).
- **Docs**: Revamped READMEs for all packages with professional layouts, badges, and SEO metadata.

---

## [0.2.0] — 2026-07-13

### Added

- **React**: Added `<SyncraftProvider>` and `useStoreRegistry()` hooks to enforce a Context-based Store Registry, guaranteeing isolated state across requests in SSR (Next.js, Remix).
- **Vue**: Added `createSyncraft()` plugin to provide a reactive store registry at the application level via `app.provide` and `inject` (compatible with Nuxt).

### Changed

- **BREAKING (React)**: `useSync` and `useSyncSuspense` now throw an error if used outside a `<SyncraftProvider>`.
- **BREAKING (Vue)**: `useSync` now throws an error if the Vue app has not installed the Syncraft plugin (`app.use(createSyncraft())`).
- **Internal**: Refactored core singleton registry away from a global module-level `Map` into context-bound registries.

---

## [0.1.1] — 2026-07-11

### Changed

- Refactored documentation structure and merged interactive playground into documentation site.

---

## [0.1.0] — 2026-06-29

### Added

- **@syncraft-labs/core**: Initial release featuring `createSyncStore<T>()`, IndexedDB persistence with `idb`, proxy mutation engine, optimistic updates with rollback, outbox queue, cold-start hydration, synchronous snapshots, and subscriptions.
- **@syncraft-labs/react**: `useSync<T>()` hook with `useSyncExternalStore`, background sync loop with exponential backoff, `fetcher`/`pusher` contracts, and offline tracking.
- **@syncraft-labs/vue**: `useSync<T>()` composable with `shallowRef`, background sync loop, and clean unmount lifecycle.
- **Infrastructure**: Turborepo monorepo with tsup (dual ESM/CJS build), Vitest test suite, and strict TypeScript configurations.
