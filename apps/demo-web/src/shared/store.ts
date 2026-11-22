import { applyPatches, type ConflictInfo } from "@syncraft-labs/core";
import type { ApiClient } from "./api.js";
import { createEmptyBoard, normalizeBoard } from "./board.js";
import type { BoardState } from "./types.js";

export { STORAGE_KEY } from "./config.js";

/**
 * Replays pending local patches on top of the authoritative remote board.
 *
 * The server state wins for everything the local tab has already pushed, while
 * edits that are still queued in the outbox stay visible. `applyPatches` skips
 * paths that no longer exist, so a card that was deleted remotely simply drops
 * its pending edits instead of crashing the demo.
 *
 * Patches may already be reflected in the remote state when another tab pushed
 * the shared outbox first, so the result is normalized before it is rendered.
 */
export function rebasePendingPatches({ remote, patches }: ConflictInfo<BoardState>): BoardState {
  if (patches.length === 0) return remote;
  return normalizeBoard(applyPatches(remote, patches));
}

export interface BoardSyncCallbacks {
  readonly onSynced?: () => void;
  readonly onSyncError?: (error: Error) => void;
}

/**
 * Shared `useSync` options for the React and Vue entries.
 *
 * Both frameworks intentionally use the same `storageKey`, fetcher, and pusher
 * so switching between `/` and `/vue.html` keeps the same local board.
 */
export function createBoardSyncOptions(api: ApiClient, callbacks: BoardSyncCallbacks = {}) {
  return {
    initialState: createEmptyBoard(),
    fetcher: api.fetcher,
    pusher: api.pusher,
    syncInterval: 4_000,
    conflictStrategy: "custom" as const,
    resolver: rebasePendingPatches,
    onSyncSuccess: callbacks.onSynced,
    onSyncError: callbacks.onSyncError,
  };
}
