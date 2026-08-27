# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Core**: Added `SyncraftError` class extending `Error` with structured metadata (`source: "sync" | "fetch" | "hydration" | "store"`, `retryable: boolean`, and `cause`), plus `toSyncraftError()` normalization helper. Exported from `@syncraft-labs/core`, `@syncraft-labs/react`, and `@syncraft-labs/vue`.
- **React & Vue**: Refactored `useSync` lifecycle with singleton `StoreController` per store key. Deduplicates hydration, initial fetch, and background sync loops across multiple components sharing a storage key (#38).
- **React & Vue**: Added in-flight sync loop mutex and single-snapshot compaction (`compactOutbox(rawOutbox)`) to prevent outbox re-read windows and overlapping reconnect push race conditions (#39).
- **React & Vue**: Added reactive options support and fixed cross-clearing bug where background sync success previously cleared unrelated fetch or hydration errors (#40).
- **React & Vue**: Clarified and documented error contracts: `update()` operates as fire-and-forget (swallowing errors into `error` state), while `refetch()` throws on failure for imperative error handling while setting `error` state (#40).
- **React**: Fixed `useSyncSuspense` infinite throw loop upon hydration rejection by caching errors, throwing directly to Error Boundaries, and guarding against `undefined` data (#41). Added full `useSyncSuspense` test suite.
- **Core**: Added `validateStateShape()` utility for explicit detection of unsupported types (Date, Map, Set, custom class instances, RegExp, etc.) in state trees. Date objects emit a development-mode warning guiding developers toward ISO strings or timestamps; all other unsupported types throw an explicit Error with the exact property path and constructor name. Integrated into `createSyncStore`, `produceWithPatches`, `hydrate()`, and `BroadcastChannel` synchronization in development mode (zero production overhead).
- **Core**: Added and exported `isUnsupportedType()` utility for querying whether a value is unsupported for state persistence and proxy drafting.
- **Core**: Exported `validateStateShape` and `isUnsupportedType` from `@syncraft-labs/core`.

## [0.4.2] - 2026-08-22

### Security
- **Core**: Evicted PolinRider malware artifacts from all build configurations, core assets, and package entry points.
- **Project**: Conducted a full build integrity audit from an isolated, verified clean environment.
- **Infrastructure**: Hardened account security by rotating all internal NPM publishing tokens and enforcing mandatory Two-Factor Authentication (2FA) for all subsequent package releases.

## [0.4.1] - 2026-08-22 [WITHDRAWN]

### Security
- **Notice**: This version was compromised by a supply-chain attack associated with the PolinRider malware campaign, which injected obfuscated information-stealing code via extensive whitespace padding. 
- **Action**: This version has been strictly deprecated on the NPM registry and pulled from active distribution. Do not install or depend on this version.


## [0.4.0] - 2026-08-21

### Changed
- **BREAKING (Core)**: `OutboxEntry<T>` no longer includes a `snapshot` field. Outbox entries now store only `patches` and `inversePatches`, reducing storage size by >80% for large state. If your `pusher` function relied on `entry.snapshot`, use `store.getSnapshot()` instead or reconstruct state via the new `applyPatches()` utility.

### Added
- **Core**: Added circular reference detection during state proxy traversal, draft mutations, and store hydration in development mode. Throws an explicit `Error` with the property path (e.g., `Circular reference detected at path "a.b.self"`) to prevent infinite recursion and browser hangs, while preserving full support for acyclic shared DAG (diamond) references.
- **Core**: Exported `assertNoCycles` utility function from `@syncraft-labs/core`.
- **Core**: Added deep-freeze protection for in-memory state in development mode (`NODE_ENV !== "production"`). State returned by `store.getSnapshot()`, `store.get()`, `store.hydrate()`, and subscriber callbacks is recursively frozen via `Object.freeze()` to detect and prevent accidental direct state mutations outside `store.set()`. Production builds incur zero runtime overhead.
- **Core**: Exported `deepFreeze` utility function from `@syncraft-labs/core`.
- **Core**: Added `overflowStrategy: "reject" | "dropOldest" | "forceFlush"` configuration option to `createSyncStore` (default `"reject"`). Configures store behavior when `maxOutboxSize` is reached. `"dropOldest"` drops the oldest entry with a warning; `"forceFlush"` invokes the `onOverflow` callback to attempt a sync before deciding whether to write or reject.
- **Core**: Added `onOverflow` callback option to `createSyncStore` to receive outbox overflow event details (`OutboxOverflowInfo`).
- **Core**: Exported `OutboxOverflowStrategy` and `OutboxOverflowInfo` types from `@syncraft-labs/core`.
- **React**: Exposed `overflowStrategy`, `onOverflow`, and `maxOutboxSize` in `UseSyncOptions`.
- **Vue**: Exposed `overflowStrategy`, `onOverflow`, and `maxOutboxSize` in `UseSyncOptions`.
- **Core**: Added `compactOutbox()` method to `SyncStore` and standalone `compactOutbox()` utility function. Merges consecutive mutations to the same state path into a single outbox entry (last-write-wins), reducing pusher request count and payload size. Called automatically by React/Vue sync hooks before each push.
- **Core**: Added `applyPatches<T>(base, patches)` utility function for applying Immer-style JSON patches to a state object. Exported from `@syncraft-labs/core`.
- **Core**: Added `storageMode: "document" | "collection"` configuration option to `createSyncStore`. In `"collection"` mode (requires `idField`), state formatted as `Record<string, Entity>` is stored per-entity in IndexedDB. Mutating single entities writes only the updated entity records to IndexedDB rather than rewriting the entire state dataset.
- **React**: Exposed `storageMode` and `idField` in `UseSyncOptions`.
- **Vue**: Exposed `storageMode` and `idField` in `UseSyncOptions`.

## [0.3.0] - 2026-08-02

### Changed
- **Core**: Replaced `immer` dependency with a custom, lightweight proxy-based implementation to reduce bundle size and improve enterprise integration.
- **Types**: Changed the generic state constraint in `createSyncStore` and hooks from `T extends object` to `T extends Record<string, unknown> | any[]` (enforced via types vs interfaces for stricter plain-object adherence) to prevent runtime persistence failures with non-serializable objects like `Map` or `Set` in IndexedDB.
- **Docs**: Migrated documentation site from Docusaurus to Astro Starlight to resolve indexing issues with zero-JS static output, and updated all content to reflect v0.3.0 API changes.

## [0.2.1] - 2026-07-20

### Changed
- **Docs**: Restructured the Docusaurus documentation site with dedicated *Core Concepts* and *Getting Started* pages.
- **Docs**: Added 7 comprehensive **Production Guides** (SSR, Architecture, Error Handling, Sync Strategies, Cross-Tab Sync, and Testing).
- **Docs**: Revamped `README.md` for all packages with professional layouts, badges, and SEO metadata.

### Fixed
- **Docs**: Resolved broken links on the documentation site during Docusaurus builds.

## [0.2.0] - 2026-07-13

### Added
- **React**: Added `<SyncraftProvider>` and `useStoreRegistry()` hooks to enforce a Context-based Store Registry. This guarantees isolated state across requests and completely prevents state/data leaks in Server-Side Rendering (SSR) environments like Next.js and Remix.
- **Vue**: Added `createSyncraft()` plugin to provide a reactive store registry at the application level via `app.provide` and `inject`. This makes the library fully compatible with Nuxt.js and other Vue SSR architectures.
- **Docs**: Added `useSyncSuspense` usage guide and Provider configurations in documentation.

### Changed
- **BREAKING (React)**: `useSync` and `useSyncSuspense` now throw an error if used outside a `<SyncraftProvider>`. You must wrap your application root with `<SyncraftProvider>`.
- **BREAKING (Vue)**: `useSync` now throws an error if the Vue app has not installed the Syncraft plugin. You must run `app.use(createSyncraft())` in your main entry file.
- **Internal**: Refactored the core singleton logic to no longer rely on a global module-level `Map`. The registry is now safely bound to the component tree context.

### Fixed
- Fatal data leakage bug where state from one user could bleed into another user's request during Server-Side Rendering (SSR).

## [0.1.1] - 2026-07-11

### Changed
- Refactored documentation structure to simplify content to Intro, React, and Vue guides.
- Merged the standalone Vite playground application directly into the Docusaurus documentation as a custom page (`/playground`).
- Migrated playground styles from Tailwind CSS to CSS Modules for better compatibility with Docusaurus.
- Updated documentation navigation, sidebar, and footer to reflect the new structure.

### Removed
- Removed standalone `apps/playground` workspace.
- Removed unused Docusaurus template components (`HomepageFeatures`, `markdown-page.mdx`).
- Removed `core.md`, `contributing.md`, and `publishing.md` from the documentation sidebar (content is preserved in `intro.md` or root repository files).

## [0.1.0] - 2026-06-29

### Added

#### @syncraft-labs/core
- `createSyncStore<T>()` factory — the heart of Syncraft Labs
- IndexedDB persistence layer with `idb` (separate `state` and `outbox` stores)
- Immer-powered mutations via `produceWithPatches` (captures patches + inverse patches)
- Optimistic updates with automatic rollback on persistence failure
- Outbox queue: append-only log of pending mutations for eventual sync
- Outbox size limit (`maxOutboxSize`, default 1000) to prevent unbounded growth
- `hydrate()` for IndexedDB cold-start loading
- `getSnapshot()` synchronous fast-path for `useSyncExternalStore`
- `subscribe()` for listener-based reactivity
- `destroy()` for clean resource cleanup

#### @syncraft-labs/react
- `useSync<T>(key, options)` hook — primary React integration
- `useSyncExternalStore` for tearing-safe subscriptions
- Auto-hydration from IndexedDB on mount
- Background sync loop with exponential backoff (1s → 60s max)
- `fetcher` support for initial remote data loading
- `pusher` support for background outbox draining
- `refetch()` for pull-to-refresh
- `isHydrating`, `isSyncing`, `isOffline`, `error` reactive states
- Network online/offline tracking with immediate sync on reconnect
- Singleton store registry (multiple components share one store per key)
- `destroyStore(key)` for manual cleanup

#### @syncraft-labs/vue
- `useSync<T>(key, options)` composable — primary Vue 3 integration
- `shallowRef` for state (avoids deep reactivity on Immer-managed objects)
- Auto-hydration from IndexedDB on mount via `onMounted`
- Background sync loop with exponential backoff
- `fetcher` / `pusher` support (same as React)
- `refetch()` for pull-to-refresh
- All reactive states as Vue `Ref` / `ShallowRef`
- Network online/offline tracking
- Singleton store registry
- Clean unmount via `onUnmounted`

#### Infrastructure
- Turborepo monorepo with `packages/*` and `apps/*` workspaces
- tsup build (ESM + CJS dual output with `.d.ts` declarations)
- Vitest test suite with `fake-indexeddb`
- Strict TypeScript config (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, etc.)
- Playground app (React + Vite)
