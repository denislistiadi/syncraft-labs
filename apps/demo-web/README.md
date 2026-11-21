# Syncraft Kanban — v0.9.0 reference app

A two-framework Kanban board that dogfoods `@syncraft-labs/core`,
`@syncraft-labs/react`, and `@syncraft-labs/vue` against a real HTTP API. React
is served at `/` and Vue at `/vue.html`; both share the same board, IndexedDB
storage key, and sync semantics.

The app is intentionally small, but it exercises the parts of Syncraft that are
hard to trust from unit tests alone: optimistic writes, durable offline queues,
idempotent pushes, SSE fan-out, conflict rebasing, and cross-tab updates.

## Stack

| Layer | Technology |
| --- | --- |
| UI | React 19 and Vue 3.5, one shared CSS file |
| Local state | `@syncraft-labs/core` via `useSync` / `useSync` composable |
| API | Hono on Node 24 |
| Database | libSQL/SQLite locally, Turso in production |
| Build | Vite 7 with React and Vue entries |
| Browser tests | Playwright/Chromium |

## Run locally

From the repository root:

```bash
npm install
npm run demo:dev
```

That starts the API on `http://localhost:8787` and Vite on
`http://localhost:5173`:

- React: <http://localhost:5173/>
- Vue: <http://localhost:5173/vue.html>
- API health: <http://localhost:8787/health>

You can also run the processes separately:

```bash
npm run dev --workspace @syncraft-labs/demo-api
npm run dev --workspace @syncraft-labs/demo-web
```

Vite proxies `/api` and `/health` to port 8787, so the default configuration
needs no environment variables. Set `VITE_API_URL` to an absolute API origin
when the API is not behind the proxy. See `.env.example`.

Each board is addressed with `?board=<id>`; the default is `demo`. Use a fresh
ID when you want an isolated seed board for manual testing.

## What to try

1. Add a card, drag it between columns, or use the arrow controls on touch.
2. Open **Test Lab → Offline**, add a card, then switch back online and watch
   the outbox drain.
3. Open React and Vue in two tabs on the same board and edit from both.
4. Open **Devtools** to inspect pushes, duplicates, failures, latency, and the
   event log.
5. Use **Reset** to restore the server seed, or **Clear local cache** to delete
   this origin's IndexedDB and reload from the API.

## How the sync path works

- State shape: `{ columns: [{ id, title, cardIds }], cards: Record<string, Card> }`.
- Both frameworks use the same `storageKey` (`syncraft-kanban-demo-v1`) and the
  options in `src/shared/store.ts`.
- Each tab gets a client ID in `sessionStorage`, so SSE updates from other tabs
  are not filtered out.
- The client sends an `X-Idempotency-Key` derived from the outbox timestamp and
  patches. A duplicate retry returns the current board with `duplicate: true`.
- Remote updates are rebased on top of pending outbox patches with the custom
  resolver. Replayed adds are normalized so a card cannot appear twice.
- SSE events carry `updatedBy`; clients ignore their own events to avoid echo
  duplicates.

## Tests

```bash
npm run demo:typecheck
npm run demo:build
npm run demo:test      # API integration tests
npm run demo:e2e       # Playwright: React, Vue, sync, recovery
```

The Playwright suite starts the API and Vite automatically, uses a temporary
SQLite database, and covers:

- create/edit/move/delete parity for React and Vue
- mobile reorder and column-crossing controls
- offline queue and reconnect
- SSE between separate React and Vue contexts
- duplicate prevention when two tabs share IndexedDB
- reset and clear-local-cache recovery

## Layout

```text
apps/demo-web/
  src/react/       React entry and components
  src/vue/         Vue entry and SFCs
  src/shared/      board model, API client, SSE, log, config
  src/styles.css   shared responsive styling
  e2e/             Playwright specs and helpers
```

## Constraints

This is a demo, not a production service. There is no auth or per-user board
ownership, every visitor to a board ID sees the same state, and the free Render
API sleeps after inactivity. See the [runbook](../../docs/demo-runbook.md) for
deployment and the [field-testing plan](../../docs/field-testing-plan.md) for
the browser matrix.
