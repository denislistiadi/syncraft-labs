import type { TodoState } from "./types.js";

export const fetcher = async (): Promise<TodoState> => {
  await new Promise((resolve) => setTimeout(resolve, 600));
  return {
    todos: [
      { id: "seed-1", text: "Integrate Syncraft Labs core", done: true },
      { id: "seed-2", text: "Review pull requests", done: true },
      { id: "seed-3", text: "Update documentation to Astro", done: false },
    ],
  };
};

export const pusher = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 500));
};
