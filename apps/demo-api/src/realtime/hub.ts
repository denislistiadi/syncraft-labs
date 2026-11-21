import type { BoardState } from "../board/types.js";

export type BoardEventType = "update" | "reset";

export interface BoardEvent {
  readonly type: BoardEventType;
  readonly boardId: string;
  readonly version: number;
  readonly updatedAt: number;
  readonly updatedBy: string;
  readonly state: BoardState;
}

type BoardEventListener = (event: BoardEvent) => void | Promise<void>;

/**
 * In-process fan-out for SSE subscribers.
 *
 * Render runs a single free instance, so an in-memory hub is enough. If the
 * demo ever scales horizontally this becomes a pub/sub adapter instead.
 */
export class BoardHub {
  private readonly listeners = new Map<string, Set<BoardEventListener>>();

  subscribe(boardId: string, listener: BoardEventListener): () => void {
    let boardListeners = this.listeners.get(boardId);
    if (!boardListeners) {
      boardListeners = new Set();
      this.listeners.set(boardId, boardListeners);
    }
    boardListeners.add(listener);

    return () => {
      boardListeners.delete(listener);
      if (boardListeners.size === 0) {
        this.listeners.delete(boardId);
      }
    };
  }

  listenerCount(boardId: string): number {
    return this.listeners.get(boardId)?.size ?? 0;
  }

  async publish(event: BoardEvent): Promise<void> {
    const boardListeners = this.listeners.get(event.boardId);
    if (!boardListeners) return;
    await Promise.allSettled(
      [...boardListeners].map((listener) => Promise.resolve(listener(event))),
    );
  }

  close(): void {
    this.listeners.clear();
  }
}
