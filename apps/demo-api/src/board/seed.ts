import type { BoardState } from "./types.js";

const now = Date.now();
const minute = 60_000;

/**
 * Seeds a readable board that doubles as the field-testing checklist.
 * IDs are stable so screenshots and reports stay comparable between resets.
 */
export function createSeedBoard(): BoardState {
  return {
    columns: [
      { id: "backlog", title: "Backlog", cardIds: ["offline-mode", "fresh-device", "join-tab"] },
      { id: "in-progress", title: "In Progress", cardIds: ["iphone-safari", "firefox-private"] },
      { id: "review", title: "Review", cardIds: ["duplicate-pushes"] },
      { id: "done", title: "Done", cardIds: ["ship-v08"] },
    ],
    cards: {
      "offline-mode": {
        id: "offline-mode",
        title: "Try offline mode",
        notes: "Disconnect the network, move a card, reload, then reconnect.",
        createdAt: now - 6 * minute,
      },
      "fresh-device": {
        id: "fresh-device",
        title: "Open on a fresh device",
        notes: "Confirm the seed board loads from the API on first visit.",
        createdAt: now - 5 * minute,
      },
      "join-tab": {
        id: "join-tab",
        title: "Edit from a second tab",
        notes: "Watch BroadcastChannel update the board and note duplicate pushes.",
        createdAt: now - 4 * minute,
      },
      "iphone-safari": {
        id: "iphone-safari",
        title: "Test Safari on iPhone",
        notes: "Drag with touch, rotate the device, and force-quit the browser.",
        createdAt: now - 3 * minute,
      },
      "firefox-private": {
        id: "firefox-private",
        title: "Test Firefox Private Browsing",
        notes: "IndexedDB should persist until the private window closes.",
        createdAt: now - 2 * minute,
      },
      "duplicate-pushes": {
        id: "duplicate-pushes",
        title: "Audit duplicate pushes",
        notes: "Compare push totals with unique idempotency keys in /api/stats.",
        createdAt: now - minute,
      },
      "ship-v08": {
        id: "ship-v08",
        title: "Ship v0.8.0",
        notes: "Published to npm with docs, encryption, and collection storage.",
        createdAt: now - 10 * minute,
      },
    },
  };
}
