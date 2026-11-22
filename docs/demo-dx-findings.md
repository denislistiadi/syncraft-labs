# DX findings — building the v0.9.0 reference app

Observations from dogfooding `@syncraft-labs/core`, `@syncraft-labs/react`, and
`@syncraft-labs/vue` in a full-stack Kanban app. This is the developer-experience
companion to the [field-testing report](./field-testing-report.md); runtime
browser results are recorded there.

## What was built

- React and Vue entries sharing one board model, storage key, API client, SSE
  client, and event log
- Hono + libSQL API with idempotent patch application, SSE fan-out, reset, and
  push statistics
- Playwright coverage for both frameworks, offline reconnect, SSE, reset, and
  cache clearing
- Deployed shape: Render static site, Render web service, Turso free database

## Friction and edge cases

### 1. `getSnapshot()` warns during normal framework hydration

**Observed:** Every cold load logs:

```text
[Syncraft Labs] getSnapshot() called on store "..." before hydrate() completed.
```

Both framework bindings read the store during the first render, before the
mount effect can call `hydrate()`. The warning is therefore expected for normal
hook usage, not a sign that the app forgot to hydrate.

**Workaround in the demo:** Treat `data` as possibly `undefined` and render an
empty board while `isHydrating` is true.

**Suggested follow-up:** Suppress the warning for framework bindings, or return
`initialState` from `getSnapshot()` until hydration completes.

### 2. The default `useSync` return type is `T | undefined`

`useSync<BoardState>(...)` infers `data` as `BoardState | undefined`, so strict
apps must either guard every access or write `useSync<BoardState, BoardState>`.
The second type parameter is easy to miss in the docs.

**Workaround in the demo:** Explicit `useSync<BoardState, BoardState>` plus a
`createEmptyBoard()` fallback.

**Suggested follow-up:** Make the hook’s default return type reflect the
presence of `initialState`, or document the two-parameter form in the quick
start.

### 3. Tabs share the outbox but not a client identity

Both entries intentionally use the same IndexedDB key, which is what makes the
React/Vue switch seamless. But tabs also share the outbox: one tab can push an
entry that another tab created and still holds in memory. When the second tab
then receives the SSE update, it replays its pending add patch on top of a state
that already contains the card. Array `add` patches insert by index, so the card
ID appeared twice.

**Workaround in the demo:** Normalize `columns[].cardIds` after replaying
patches, keeping the first occurrence. Idempotency still prevents duplicate
server writes.

**Suggested follow-up:** Define outbox ownership/claiming between tabs, or make
the conflict resolver aware that an entry already applied remotely should not be
replayed locally.

### 4. `baseVersion` is accepted but not enforced

The API validates and accepts `baseVersion`, then applies entries inside a
transaction without comparing it to the current board version. Concurrent
writers are serialized, but the loser gets last-writer-wins rather than a
conflict signal.

**Why it is acceptable here:** The demo’s resolver is intentionally optimistic,
and idempotency covers retries. It would be surprising for consumers who assume
`baseVersion` provides optimistic concurrency control.

**Suggested follow-up:** Either enforce it and return a conflict response, or
document that it is informational.

### 5. IndexedDB cannot be deleted from the live page

Clearing the local cache while the store connection is open is blocked by the
browser. The demo writes a `sessionStorage` flag, reloads, and deletes the
database during bootstrap before the store opens.

**Field-testing relevance:** Private browsing and WebKit may block or evict
IndexedDB entirely. The app must still mount and render the API board.

**Suggested follow-up:** Expose a store-level “close and delete” helper so apps
do not need to invent the reload dance.

### 6. Windows SQLite test cleanup is brittle

Deleting a per-test SQLite file on Windows hit `EBUSY` because libSQL still held
native handles. The API suite now shares one temporary database across tests.

**Suggested follow-up:** Provide a test helper that closes the client and waits
for handles to release, or document the shared-database pattern.

### 7. Forced shutdown can print a libuv assertion

Stopping the API while an SSE connection is open sometimes prints
`UV_HANDLE_CLOSING` during forced shutdown on Windows. Request handling is
unaffected and the assertion does not appear during normal operation.

**Suggested follow-up:** Close SSE clients explicitly on `SIGINT`/`SIGTERM`
before exiting. This is also good production hygiene.

### 8. Build-time API origin is easy to forget

`VITE_API_URL` is baked into the static build. Changing the Render API origin
without rebuilding the static site leaves the UI pointed at the old API.

**Workaround:** Document the rebuild step in the runbook and verify the health
pill after deploy.

### 9. Local host resolution can surprise Windows users

Vite listened on `::1` while `curl http://127.0.0.1:5173` failed;
`http://localhost:5173` worked. The Playwright config uses `localhost` for this
reason.

### 10. Free-tier wake time shapes the UX

A sleeping Render API can take up to a minute to answer. The demo shows a wake
banner, retries health checks, and lets the local board render from IndexedDB
meanwhile. This is a deployment constraint, not a Syncraft issue, but it is the
first thing a reviewer sees after the demo sits idle.

## Performance notes

Local production builds after the final UI changes:

| Entry | Raw | Gzip |
| --- | --- | --- |
| React entry | 219.04 kB | 68.06 kB |
| Vue entry | 91.09 kB | 34.33 kB |
| Shared UI chunk | 47.59 kB | 14.64 kB |
| CSS | 18.09 kB | 4.34 kB |

These include React/Vue runtime code, so they are not a measurement of the
Syncraft packages alone. Local interaction latency was not benchmarked
separately; the sync loop runs every 4 seconds and SSE carries remote updates
immediately. No performance bottleneck appeared during the Playwright runs.
Body size, storage quota, and many-writer stress remain out of scope for this
demo.

## Recommended follow-up issues

1. Quiet the pre-hydration `getSnapshot()` warning for framework bindings.
2. Document or improve the `useSync<T, R>` default return type.
3. Decide on outbox ownership across tabs and harden replay semantics.
4. Enforce or document `baseVersion` behavior.
5. Add a supported local-cache reset helper.
6. Close SSE clients during graceful shutdown.
