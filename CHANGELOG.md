# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
