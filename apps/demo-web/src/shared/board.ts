import type { BoardState, Card, Column } from "./types.js";

export const COLUMN_DEFINITIONS: readonly { id: string; title: string }[] = [
  { id: "backlog", title: "Backlog" },
  { id: "in-progress", title: "In Progress" },
  { id: "review", title: "Review" },
  { id: "done", title: "Done" },
];

export function createEmptyBoard(): BoardState {
  return {
    columns: COLUMN_DEFINITIONS.map((column) => ({
      id: column.id,
      title: column.title,
      cardIds: [],
    })),
    cards: {},
  };
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getColumn(board: BoardState, columnId: string): Column | undefined {
  return board.columns.find((column) => column.id === columnId);
}

export function getColumnOf(board: BoardState, cardId: string): Column | undefined {
  return board.columns.find((column) => column.cardIds.includes(cardId));
}

export function getColumnCards(board: BoardState, column: Column): Card[] {
  const cards: Card[] = [];
  for (const cardId of column.cardIds) {
    const card = board.cards[cardId];
    if (card) cards.push(card);
  }
  return cards;
}

export function addCard(
  draft: BoardState,
  columnId: string,
  title: string,
  notes = "",
): string {
  const column = getColumn(draft, columnId);
  const trimmedTitle = title.trim();
  if (!column || trimmedTitle.length === 0) return "";

  const id = createId();
  draft.cards[id] = {
    id,
    title: trimmedTitle,
    notes: notes.trim(),
    createdAt: Date.now(),
  };
  column.cardIds.unshift(id);
  return id;
}

export function editCard(
  draft: BoardState,
  cardId: string,
  patch: { title?: string; notes?: string },
): void {
  const card = draft.cards[cardId];
  if (!card) return;
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (title.length > 0) card.title = title;
  }
  if (patch.notes !== undefined) {
    card.notes = patch.notes.trim();
  }
}

export function deleteCard(draft: BoardState, cardId: string): void {
  delete draft.cards[cardId];
  for (const column of draft.columns) {
    column.cardIds = column.cardIds.filter((id) => id !== cardId);
  }
}

export function moveCard(
  draft: BoardState,
  cardId: string,
  toColumnId: string,
  toIndex = 0,
): void {
  const target = getColumn(draft, toColumnId);
  if (!target || !draft.cards[cardId]) return;

  for (const column of draft.columns) {
    column.cardIds = column.cardIds.filter((id) => id !== cardId);
  }

  const index = Math.max(0, Math.min(toIndex, target.cardIds.length));
  target.cardIds.splice(index, 0, cardId);
}

/**
 * Moves a card one slot left/right. At a column boundary the card crosses into
 * the adjacent column, which gives touch users a predictable alternative to
 * drag and drop.
 */
export function moveCardBy(draft: BoardState, cardId: string, direction: -1 | 1): void {
  const sourceIndex = draft.columns.findIndex((column) => column.cardIds.includes(cardId));
  const source = draft.columns[sourceIndex];
  if (!source) return;

  const position = source.cardIds.indexOf(cardId);
  const nextPosition = position + direction;

  if (nextPosition >= 0 && nextPosition < source.cardIds.length) {
    const otherId = source.cardIds[nextPosition];
    if (!otherId) return;
    source.cardIds[position] = otherId;
    source.cardIds[nextPosition] = cardId;
    return;
  }

  const target = draft.columns[sourceIndex + direction];
  if (!target) return;

  source.cardIds.splice(position, 1);
  if (direction === 1) {
    target.cardIds.unshift(cardId);
  } else {
    target.cardIds.push(cardId);
  }
}

export function moveCardToColumn(draft: BoardState, cardId: string, toColumnId: string): void {
  const target = getColumn(draft, toColumnId);
  if (!target) return;
  moveCard(draft, cardId, toColumnId, target.cardIds.length);
}

/** Swaps a card with its neighbour inside the same column. */
export function moveCardWithinColumn(
  draft: BoardState,
  cardId: string,
  direction: -1 | 1,
): void {
  const column = getColumnOf(draft, cardId);
  if (!column) return;
  const position = column.cardIds.indexOf(cardId);
  const nextPosition = position + direction;
  if (nextPosition < 0 || nextPosition >= column.cardIds.length) return;
  const otherId = column.cardIds[nextPosition];
  if (!otherId) return;
  column.cardIds[position] = otherId;
  column.cardIds[nextPosition] = cardId;
}

export function isBoardState(value: unknown): value is BoardState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { columns?: unknown; cards?: unknown };
  if (!Array.isArray(candidate.columns)) return false;
  if (typeof candidate.cards !== "object" || candidate.cards === null) return false;

  return candidate.columns.every((column) => {
    if (typeof column !== "object" || column === null) return false;
    const entry = column as { id?: unknown; title?: unknown; cardIds?: unknown };
    return (
      typeof entry.id === "string" &&
      typeof entry.title === "string" &&
      Array.isArray(entry.cardIds) &&
      entry.cardIds.every((id) => typeof id === "string")
    );
  });
}
