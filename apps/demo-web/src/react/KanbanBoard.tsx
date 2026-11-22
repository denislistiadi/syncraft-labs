import {
  useState,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { getColumnCards } from "../shared/board.js";
import type { BoardState, Card, Column } from "../shared/types.js";
import { columnTheme } from "../shared/ui.js";

const CARD_MIME = "application/x-syncraft-card";

export interface KanbanBoardProps {
  readonly board: BoardState;
  readonly isBusy?: boolean;
  readonly onAddCard: (columnId: string, title: string) => void;
  readonly onOpenCard: (cardId: string) => void;
  readonly onMoveCard: (cardId: string, toColumnId: string, index: number) => void;
  readonly onMoveBy: (cardId: string, direction: -1 | 1) => void;
  readonly onMoveWithin: (cardId: string, direction: -1 | 1) => void;
}

export function KanbanBoard(props: KanbanBoardProps) {
  return (
    <div className="board" role="list" aria-label="Kanban board" aria-busy={props.isBusy}>
      {props.board.columns.map((column, index) => (
        <BoardColumn
          key={column.id}
          board={props.board}
          column={column}
          columnIndex={index}
          columnCount={props.board.columns.length}
          onAddCard={props.onAddCard}
          onOpenCard={props.onOpenCard}
          onMoveCard={props.onMoveCard}
          onMoveBy={props.onMoveBy}
          onMoveWithin={props.onMoveWithin}
        />
      ))}
    </div>
  );
}

interface BoardColumnProps extends Omit<KanbanBoardProps, "board"> {
  readonly board: BoardState;
  readonly column: Column;
  readonly columnIndex: number;
  readonly columnCount: number;
}

function BoardColumn(props: BoardColumnProps) {
  const { board, column, columnIndex, columnCount } = props;
  const cards = getColumnCards(board, column);
  const theme = columnTheme(column.id);
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [isDropTarget, setIsDropTarget] = useState(false);

  const style = {
    "--column-accent": theme.accent,
    "--column-soft": theme.soft,
  } as CSSProperties;

  function readCardId(event: DragEvent): string {
    return (
      event.dataTransfer.getData(CARD_MIME) ||
      event.dataTransfer.getData("text/plain") ||
      ""
    );
  }

  function handleDrop(event: DragEvent<HTMLElement>): void {
    event.preventDefault();
    setIsDropTarget(false);
    const cardId = readCardId(event);
    if (cardId) props.onMoveCard(cardId, column.id, column.cardIds.length);
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    const title = draft.trim();
    if (title.length === 0) return;
    props.onAddCard(column.id, title);
    setDraft("");
  }

  return (
    <section
      className={`board-column${isDropTarget ? " board-column--target" : ""}`}
      style={style}
      role="listitem"
      aria-labelledby={`column-${column.id}`}
    >
      <header className="board-column__header">
        <span className="board-column__dot" aria-hidden="true" />
        <h2 id={`column-${column.id}`}>{column.title}</h2>
        <span className="board-column__count" aria-label={`${cards.length} cards`}>
          {cards.length}
        </span>
        <button
          type="button"
          className="board-column__add"
          onClick={() => setIsAdding((open) => !open)}
          aria-expanded={isAdding}
        >
          {isAdding ? "Close" : "+ Add"}
        </button>
      </header>

      <div
        className={`board-column__cards${cards.length === 0 ? " board-column__cards--empty" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setIsDropTarget(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setIsDropTarget(false);
        }}
        onDrop={handleDrop}
      >
        {cards.length === 0 ? (
          <p className="board-column__empty">Drop a card here, or add one below.</p>
        ) : null}

        {cards.map((card, cardIndex) => (
          <CardTile
            key={card.id}
            card={card}
            column={column}
            columnIndex={columnIndex}
            columnCount={columnCount}
            cardIndex={cardIndex}
            onOpenCard={props.onOpenCard}
            onMoveCard={props.onMoveCard}
            onMoveBy={props.onMoveBy}
            onMoveWithin={props.onMoveWithin}
          />
        ))}
      </div>

      {isAdding ? (
        <form className="add-card-form" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor={`new-card-${column.id}`}>
            New card title
          </label>
          <textarea
            id={`new-card-${column.id}`}
            className="add-card-form__input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="What needs to happen?"
            rows={2}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSubmit(event);
              }
              if (event.key === "Escape") setIsAdding(false);
            }}
          />
          <div className="add-card-form__actions">
            <button type="submit" className="button button--primary" disabled={!draft.trim()}>
              Add card
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                setDraft("");
                setIsAdding(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="board-column__footer-add"
          onClick={() => setIsAdding(true)}
        >
          + Add a card
        </button>
      )}
    </section>
  );
}

interface CardTileProps {
  readonly card: Card;
  readonly column: Column;
  readonly columnIndex: number;
  readonly columnCount: number;
  readonly cardIndex: number;
  readonly onOpenCard: (cardId: string) => void;
  readonly onMoveCard: (cardId: string, toColumnId: string, index: number) => void;
  readonly onMoveBy: (cardId: string, direction: -1 | 1) => void;
  readonly onMoveWithin: (cardId: string, direction: -1 | 1) => void;
}

function CardTile(props: CardTileProps) {
  const { card, column, columnIndex, columnCount, cardIndex } = props;
  const [isDragging, setIsDragging] = useState(false);
  const canLeft = columnIndex > 0 || cardIndex > 0;
  const canRight = columnIndex < columnCount - 1 || cardIndex < column.cardIds.length - 1;
  const canUp = cardIndex > 0;
  const canDown = cardIndex < column.cardIds.length - 1;

  function open(): void {
    props.onOpenCard(card.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  }

  return (
    <article
      className={`card${isDragging ? " card--dragging" : ""}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(CARD_MIME, card.id);
        event.dataTransfer.setData("text/plain", card.id);
        setIsDragging(true);
      }}
      onDragEnd={() => setIsDragging(false)}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const cardId =
          event.dataTransfer.getData(CARD_MIME) ||
          event.dataTransfer.getData("text/plain");
        if (cardId) props.onMoveCard(cardId, column.id, cardIndex);
      }}
      onClick={open}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Edit ${card.title}`}
    >
      <h3 className="card__title">{card.title}</h3>
      {card.notes ? <p className="card__notes">{card.notes}</p> : null}
      <div className="card__meta">
        <time dateTime={new Date(card.createdAt).toISOString()}>
          {new Date(card.createdAt).toLocaleDateString([], {
            month: "short",
            day: "numeric",
          })}
        </time>
        <span className="card__move-group" aria-label="Move card">
          <button
            type="button"
            className="card__move"
            disabled={!canUp}
            aria-label="Move card up"
            title="Move up"
            onClick={(event) => {
              event.stopPropagation();
              props.onMoveWithin(card.id, -1);
            }}
          >
            ↑
          </button>
          <button
            type="button"
            className="card__move"
            disabled={!canDown}
            aria-label="Move card down"
            title="Move down"
            onClick={(event) => {
              event.stopPropagation();
              props.onMoveWithin(card.id, 1);
            }}
          >
            ↓
          </button>
          <button
            type="button"
            className="card__move"
            disabled={!canLeft}
            aria-label="Move card to previous column"
            title="Move left"
            onClick={(event) => {
              event.stopPropagation();
              props.onMoveBy(card.id, -1);
            }}
          >
            ←
          </button>
          <button
            type="button"
            className="card__move"
            disabled={!canRight}
            aria-label="Move card to next column"
            title="Move right"
            onClick={(event) => {
              event.stopPropagation();
              props.onMoveBy(card.id, 1);
            }}
          >
            →
          </button>
        </span>
      </div>
    </article>
  );
}
