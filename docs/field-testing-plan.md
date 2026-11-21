# Field-testing plan — v0.9.0 Kanban demo

This plan validates the deployed reference app on real browsers and devices. It
focuses on the promises the demo makes: instant edits, durable offline work,
idempotent sync, and live fan-out between React and Vue tabs.

## Build under test

| Item | Value |
| --- | --- |
| Release | v0.9.0 |
| Commit | _fill after deploy_ |
| Web URL | _fill after deploy_ |
| API URL | _fill after deploy_ |
| Turso database | _fill after deploy_ |

## Matrix

| ID | Environment | Why it matters |
| --- | --- | --- |
| FT-A | iPhone, current iOS, Safari | Touch drag/drop, viewport, force-quit persistence |
| FT-B | Desktop Firefox, Private Browsing | IndexedDB behavior in a private session |
| FT-C | Desktop Chrome, normal profile | Baseline and devtools counters |
| FT-D | Chrome + Firefox or Chrome + iPhone | Cross-browser SSE and shared board |

Record the exact device model, OS version, and browser version for each run.
Use a unique `?board=<id>` per run when a clean seed is useful.

## Scenarios

### 1. Cold start and seed

1. Open the web URL with a fresh browser profile and a new board ID.
2. Confirm four columns and the seeded cards appear.
3. Check the header shows **API live** and **Live** (SSE connected).
4. Reload; the board should render from IndexedDB before the API responds.

Pass: no blank board, no console errors, and the seed appears once.

### 2. Create, edit, and delete

1. Add a card to Backlog.
2. Open it, change the title and notes, save.
3. Reload and confirm both fields persisted.
4. Delete the card and confirm it disappears from every column.

Pass: no duplicate card, no stale dialog, and the change survives reload.

### 3. Touch and keyboard movement

1. On iPhone, drag a card between columns.
2. Use the card's left/right arrows to cross columns and up/down to reorder.
3. Rotate portrait → landscape → portrait.
4. On desktop, drag with the mouse and use the dialog's **Move to** chips.

Pass: the card lands where the control says, the layout stays usable at 390 px,
and no control becomes unreachable.

### 4. Test Lab offline queue

1. Open **Test Lab**, select **Offline**, and close the panel.
2. Add a card and move another card.
3. Confirm the edits render immediately and the sync status stays pending.
4. Reload while still offline; edits should come back from IndexedDB.
5. Select **Online** and wait for the outbox to drain.
6. Reload and confirm the edits reached the API.

Pass: nothing is lost, and the server state matches the UI after reconnect.

### 5. Real network loss

1. Disable Wi-Fi/cellular on the device (not just Test Lab).
2. Add or edit a card.
3. Re-enable the network and wait for SSE to reconnect.
4. Check the Devtools event log and `/api/boards/<id>/stats`.

Pass: the queued edit syncs once, `duplicatePushes` stays low, and both tabs
converge.

### 6. React ↔ Vue fan-out

1. Open React and Vue on the same board in two tabs or two devices.
2. Add a card in React; expect it in Vue.
3. Move a card in Vue; expect the new position in React.
4. Repeat with one tab in Firefox and one in Chrome.

Pass: each change appears once, within a few seconds, without a manual refresh.

### 7. Private browsing persistence

1. In Firefox Private Browsing, add a card and reload within the same window.
2. Close the private window, open a new one, and load the same board.

Pass: state persists until the private window closes; the new window loads the
server state. A browser that blocks IndexedDB must still render the API board.

### 8. Background, sleep, and force-quit

1. Add a card, background the browser, wait two minutes, and return.
2. Lock the phone for several minutes, unlock, and interact.
3. Force-quit the browser after an online edit, reopen, and load the board.

Pass: the app reconnects or resumes without a blank screen; persisted edits are
present and the outbox drains.

### 9. Destructive controls

1. Use **Reset** and confirm both tabs return to the seed.
2. Use **Clear local cache** in one tab and confirm it reloads from the API.
3. Confirm other tabs and the server are unaffected by the local clear.

Pass: reset is shared; clearing the cache is local to the origin and does not
delete server data.

### 10. Failure injection and wake behavior

1. Use **Fail next push** and confirm the outbox retries.
2. Enable **Permanent** failures, confirm the error banner, then disable it.
3. Add 1–2 seconds of latency and confirm optimistic updates stay responsive.
4. Let the Render API sleep, reload the static site, and retry from the banner.

Pass: failures are visible and recoverable, and latency does not block input.

## Evidence to capture

- Screenshot of each matrix environment at the end of the run.
- The `/api/boards/<id>/stats` JSON for the primary board.
- Console/network errors, if any.
- Exact steps for every failure, with expected vs actual behavior.

## Pass criteria

- No lost acknowledged edits after reload or reconnect.
- No duplicate cards or duplicate visible renders.
- React and Vue converge on the same board state.
- Touch controls and dialogs remain usable at 390 px.
- No uncaught page errors during normal flows.
- Free-tier wake behavior is explained in the UI and recoverable.

## Out of scope

- Authentication, per-user boards, or access control
- CRDT conflict resolution and multi-writer stress tests
- File uploads, PWA service worker, encryption toggle
- More than two concurrent writer tabs
- Load or quota testing beyond the free-tier limits
