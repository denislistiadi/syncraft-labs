import type { OutboxEntry } from "@syncraft-labs/core";
import type { TodoState } from "./types";

export const fetcher = async (): Promise<TodoState> => {
  await new Promise((resolve) => setTimeout(resolve, 800));
  return {
    todos: [
      { id: "seed-1", text: "Integrate Syncraft Labs core", done: true },
      { id: "seed-2", text: "Review pull requests", done: true },
      { id: "seed-3", text: "Update documentation", done: false },
    ],
  };
};

export const pusher = async (_entries: readonly OutboxEntry<TodoState>[]): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 600));
  if (Math.random() < 0.1) {
    throw new Error("Server timeout");
  }
};
