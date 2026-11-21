# Field-testing report — v0.9.0 Kanban demo

**Status:** awaiting deployment. Results will be filled from the
[field-testing plan](./field-testing-plan.md) once the Render and Turso
deployment is live. Build-time developer-experience observations are recorded
in [DX findings](./demo-dx-findings.md).

## Build

| Item | Value |
| --- | --- |
| Release | v0.9.0 |
| Commit | _pending_ |
| Web URL | _pending_ |
| API URL | _pending_ |
| Test window | _pending_ |

## Results

| Environment | Cold start | Offline queue | React ↔ Vue | Reload | Verdict |
| --- | --- | --- | --- | --- | --- |
| iPhone / Safari | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |
| Firefox Private Browsing | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |
| Chrome desktop | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |

## Findings fixed before deployment

These were caught by local dogfooding and Playwright, and are already fixed on
the web branch:

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

_None recorded yet._

## Follow-up issues

_Fill after the field run. Link each issue to the environment, steps, and
expected/actual behavior._
