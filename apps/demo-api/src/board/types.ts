/**
 * Board document shared by the API routes.
 *
 * The shape intentionally mirrors the client-side Kanban model: columns hold
 * ordered card IDs, while cards live in a keyed record so patches stay small.
 */
export type Card = {
  id: string;
  title: string;
  notes: string;
  createdAt: number;
};

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardState = {
  columns: Column[];
  cards: Record<string, Card>;
};

export type BoardRecord = {
  id: string;
  state: BoardState;
  version: number;
  updatedAt: number;
};

export type BoardResponse = BoardRecord;
