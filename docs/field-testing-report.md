# Field-testing report — v0.9.0 Kanban demo

**Status:** complete. The demo is deployed and the automated live suite passed.
The manual field session is recorded below, including one process deviation: the
tester used the default `demo` board instead of the prepared `?board=` URLs. The
server push log still confirms a two-client manual session. No product defects
were found.

The test plan is in [field-testing-plan.md](./field-testing-plan.md). Build-time
developer-experience observations are in
[demo-dx-findings.md](./demo-dx-findings.md).

## Build

| Item | Value |
| --- | --- |
| Release | v0.9.0 |
| Commit | `c6a2919` |
| Web URL | <https://syncraft-demo-web.onrender.com> |
| API URL | <https://syncraft-demo-api.onrender.com> |
| Turso database | `syncraft-demo` |
| Hosting | Render free tier (Singapore) + Turso free |
| Test window | 2026-11-22 |

Manual environments:

- iPhone 16 Pro, iOS 27.2.1, Safari
- Firefox 159, Private Browsing, desktop

Automated environments:

- Chromium 159.0.8154.6 (Playwright Chrome for Testing)
- WebKit 27.2 (desktop Safari engine)
- Firefox 159.0

## Results

| Environment | Cold start | Offline queue | React ↔ Vue | Reload | Verdict |
| --- | --- | --- | --- | --- | --- |
| iPhone / Safari | Pass | Pass | Pass | Pass | **PASS** |
| Firefox Private Browsing | Pass | Pass | Pass | Pass | **PASS** |
| Chrome desktop | Pass | Pass | Pass | Pass | **PASS** (automated) |

The manual rows are tester-reported and corroborated by the server push log. The
Chrome row comes from the automated Playwright suite; WebKit and Firefox desktop
also passed the same nine tests.

## Automated verification

### Deploy smoke checks

`npm run demo:smoke:live` passed **8/8** against the deployed URLs on board
`ft-1122-smoke-2`:

- API health
- board seed (4 columns, 7 cards)
- idempotent sync (2 patches applied)
- duplicate retry rejected without a version change
- push statistics (2 pushes, 1 duplicate)
- SSE `hello` event
- CORS preflight with the exact web origin
- React and Vue HTML entries

### Browser suite

`npm run demo:e2e:live` passed **27/27**:

| Engine | Passed |
| --- | --- |
| Chromium | 9/9 |
| WebKit | 9/9 |
| Firefox | 9/9 |

The suite covers create/edit/move/delete for React and Vue, mobile controls,
offline queue drain, SSE fan-out between React and Vue contexts, duplicate
prevention when two tabs share IndexedDB, reset, and clear-local-cache recovery.
Every test uses a unique board ID.

## Manual field-run evidence

The manual session ran on the default `demo` board. The prepared isolated boards
(`ft-1122-iphone`, `ft-1122-firefox`, `ft-1122-sync`) stayed at version 1 with
zero pushes, which is how the deviation was detected.

The server recorded a real two-client session on `demo`:

```json
{
  "boardId": "demo",
  "totalPushes": 4,
  "duplicatePushes": 0,
  "uniqueKeys": 4,
  "uniqueClients": 2,
  "lastPushAt": 1795349085385
}
```

The manual session added a card titled **Hello** and moved it to **Done**. Both
operations reached Turso, and the final board state contained the card exactly
once. The board was reset to the seed after the run; it is now at version 7 with
no test cards.

This is a process note, not an application defect: the `?board=` query was
dropped when the tester opened the site. Board isolation itself is covered by
the 27 automated tests, each of which uses a unique board ID.

## Deployment finding: CORS origin

The first post-deploy smoke run failed the CORS preflight check. The API
returned the CORS method and header lists but no
`access-control-allow-origin`, which meant `CORS_ORIGIN` did not match the web
origin exactly. Setting it to the exact value below and restarting the API fixed
the check:

```text
https://syncraft-demo-web.onrender.com
```

The rerun passed 8/8. No code change was needed. The correct value is documented
in the [runbook](./demo-runbook.md#live-deployment).

## Findings fixed before deployment

These were caught by local dogfooding and Playwright, and are already fixed:

1. **Replayed add patches could duplicate a card.** When two tabs shared the
   outbox, one tab could push an entry that the other still replayed locally.
   The custom resolver now normalizes column `cardIds` after rebasing.
2. **Left/right card arrows reordered instead of crossing columns.** The labels
   promised “previous/next column”; `moveCardBy` now always crosses the boundary,
   while up/down handles reordering.
3. **Offline feedback was incomplete.** The UI now shows a browser-offline
   notice, an `aria-live` sync status, and disables busy board interactions
   during hydration/sync.

## Open findings

No product defects were found in the field run. The manual run followed the
default-board path instead of the isolated-board path; that is recorded above as
a process deviation. There were no lost acknowledged edits, duplicate cards,
convergence failures, unreachable touch controls, or uncaught page errors.

## Follow-up issues

No follow-up issues were filed for this sprint. The six developer-experience
recommendations in [demo-dx-findings.md](./demo-dx-findings.md) remain documented
candidates for a future sprint.

## Known limitations

- Render free web services spin down after about 15 minutes. The first request
  can take up to a minute; the UI shows a wake banner and retries.
- The write rate limiter is in-memory, single-instance, and keyed by IP. It
  allows 120 writes per minute and resets when the API restarts.
- Boards are public by ID. There is no authentication or per-user ownership.
- More than two concurrent writers, CRDT conflict resolution, file uploads, a
  service worker, the encryption toggle, and quota stress testing are out of
  scope for this sprint.

## Reproduce

```bash
WEB_URL=https://syncraft-demo-web.onrender.com \
API_URL=https://syncraft-demo-api.onrender.com \
npm run demo:smoke:live

E2E_WEB_URL=https://syncraft-demo-web.onrender.com \
E2E_API_URL=https://syncraft-demo-api.onrender.com \
E2E_BROWSERS=chromium,webkit,firefox \
npm run demo:e2e:live
```
