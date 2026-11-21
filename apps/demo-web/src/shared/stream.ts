import type { ApiClient } from "./api.js";
import type { StreamEvent } from "./types.js";

export interface StreamHandlers {
  readonly onEvent: (event: StreamEvent) => void;
  readonly onOpen?: () => void;
  readonly onError?: () => void;
}

/**
 * Opens an SSE connection and filters the echo of this client's own pushes.
 *
 * EventSource reconnects automatically, and the server sends a `hello` frame
 * with the current board on every reconnect, so missed events heal themselves.
 */
export function openBoardStream(api: ApiClient, handlers: StreamHandlers): () => void {
  if (typeof EventSource === "undefined") return () => undefined;

  const source = new EventSource(api.streamUrl());

  const handle = (message: MessageEvent<string>): void => {
    if (!message.data) return;
    let event: StreamEvent;
    try {
      event = JSON.parse(message.data) as StreamEvent;
    } catch {
      return;
    }
    if (event.updatedBy !== undefined && event.updatedBy === api.clientId) {
      return;
    }
    handlers.onEvent(event);
  };

  const listener = (event: Event): void => {
    handle(event as MessageEvent<string>);
  };

  source.addEventListener("hello", listener);
  source.addEventListener("update", listener);
  source.addEventListener("reset", listener);
  source.addEventListener("open", () => handlers.onOpen?.());
  source.addEventListener("error", () => handlers.onError?.());

  return () => {
    source.removeEventListener("hello", listener);
    source.removeEventListener("update", listener);
    source.removeEventListener("reset", listener);
    source.close();
  };
}
