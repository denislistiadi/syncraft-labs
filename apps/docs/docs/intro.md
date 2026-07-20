---
title: Introduction
description: Syncraft Labs is a local-first state synchronization engine for React & Vue. Get instant writes, offline persistence, and background sync out of the box.
keywords:
  - syncraft labs
  - local-first state
  - state management
  - offline-first
  - react state
  - vue state
slug: /
sidebar_position: 1
---

<div align="center">

# Syncraft Labs

**Local-First State Synchronization Engine for React & Vue**

[![npm version](https://img.shields.io/npm/v/@syncraft-labs/core?color=brightgreen&label=core)](https://www.npmjs.com/package/@syncraft-labs/core)
[![npm version](https://img.shields.io/npm/v/@syncraft-labs/react?color=61dafb&label=react)](https://www.npmjs.com/package/@syncraft-labs/react)
[![npm version](https://img.shields.io/npm/v/@syncraft-labs/vue?color=42b883&label=vue)](https://www.npmjs.com/package/@syncraft-labs/vue)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/denislistiadi/syncraft-labs/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

*Write instantly. Persist automatically. Sync eventually.*

</div>

---

## What is Syncraft Labs?

Syncraft Labs is a **local-first state management engine** that gives your app instant writes, offline persistence, and background synchronization — all with a simple hook/composable API.

Your users get **zero-latency updates** that survive page refreshes, network outages, and app restarts. When connectivity returns, pending changes sync automatically in the background.

## Why Syncraft Labs?

Building modern web applications usually involves a lot of boilerplate for fetching, caching, mutating, and handling offline scenarios. Developers often have to string together a global state manager (like Redux or Pinia), an async state manager (like React Query or SWR), and local storage manually.

**Syncraft Labs replaces all of that with a single abstraction.**

Here is what you get out of the box:

- **Snappy UI, Always:** We use an *Optimistic Update with Pessimistic Rollback* pattern. The UI updates instantly via in-memory state. No waiting for the network. No loading spinners for mutations.
- **Offline Reliability:** Data is persisted directly into the browser's `IndexedDB`. If the user goes offline, or drops their connection on a train, they can keep using your app seamlessly.
- **Eventual Consistency:** Mutations are queued locally as "patches" and sent to your backend gracefully when the connection is restored via an exponential backoff strategy.
- **Multi-Tab Safety:** If your user has 5 tabs open, editing data in one tab instantly propagates to all other tabs via `BroadcastChannel` APIs without extra server roundtrips.

## Features

| Feature | Description |
|---------|-------------|
| **Instant writes** | Optimistic updates via Immer — UI never waits for persistence |
| **IndexedDB persistence** | State survives page refresh, tab close, and browser restart |
| **Outbox sync** | Mutations queued as patches, drained by a background `pusher` |
| **Auto-hydration** | Seamless cold-start from IndexedDB with loading states |
| **Offline-ready** | Works offline, syncs automatically when back online |
| **Auto-rollback** | Reverts optimistic updates if IndexedDB write fails |
| **Cross-Tab Sync** | State automatically synchronizes across browser tabs |
| **SSR-Ready (Next.js/Nuxt)** | Provider pattern guarantees isolated state across requests |
| **Immer drafts** | Mutate state like plain JS — Immer handles immutability |
| **Tiny footprint** | Tree-shakeable, no unnecessary dependencies |

## Where to go next?

- **[Getting Started](./getting-started.md)** — Installation instructions and quick start code snippets for React and Vue.
- **[Core Concepts](./core-concepts.md)** — Learn about the mental model, data flow, and architecture of Syncraft Labs.
- **[API Reference](./packages/core.md)** — Detailed API documentation for `@syncraft-labs/core`, `@syncraft-labs/react`, and `@syncraft-labs/vue`.
- **[Production Guides](./guides/production-checklist.md)** — Pre-deployment checklists, SSR patterns, and multi-store architecture.
