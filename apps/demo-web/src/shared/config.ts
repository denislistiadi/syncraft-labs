export const STORAGE_KEY = "syncraft-kanban-demo-v1";
export const DEFAULT_BOARD_ID = "demo";
export const CLIENT_ID_STORAGE_KEY = "syncraft-kanban-demo-client-id";

const BOARD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

export function getBoardId(): string {
  if (typeof window === "undefined") return DEFAULT_BOARD_ID;
  const requested = new URLSearchParams(window.location.search).get("board");
  return requested && BOARD_ID_PATTERN.test(requested) ? requested : DEFAULT_BOARD_ID;
}

export function withBoardQuery(url: string, boardId: string): string {
  const target = new URL(url, window.location.href);
  target.searchParams.set("board", boardId);
  return target.toString();
}

export function siblingAppUrl(kind: "react" | "vue", boardId: string): string {
  const file = kind === "vue" ? "vue.html" : "index.html";
  return withBoardQuery(file, boardId);
}
