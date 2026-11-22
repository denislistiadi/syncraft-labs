import { useState, type FormEvent } from "react";
import type { Card, Column } from "../shared/types.js";
import { shortId } from "../shared/ui.js";

export interface CardDialogProps {
  readonly card: Card;
  readonly columns: readonly Column[];
  readonly currentColumnId: string | undefined;
  readonly onSave: (cardId: string, patch: { title: string; notes: string }) => void;
  readonly onDelete: (cardId: string) => void;
  readonly onMoveTo: (cardId: string, columnId: string) => void;
  readonly onClose: () => void;
}

export function CardDialog(props: CardDialogProps) {
  const [title, setTitle] = useState(props.card.title);
  const [notes, setNotes] = useState(props.card.notes);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length === 0) return;
    props.onSave(props.card.id, { title: trimmed, notes: notes.trim() });
    props.onClose();
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-dialog-title"
        onSubmit={handleSubmit}
      >
        <header className="dialog__header">
          <div>
            <p className="eyebrow">Card</p>
            <h2 id="card-dialog-title">Edit card</h2>
          </div>
          <button type="button" className="icon-button" onClick={props.onClose} aria-label="Close">
            ×
          </button>
        </header>

        <label className="field">
          <span className="field__label">Title</span>
          <input
            className="field__input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            autoFocus
            required
          />
        </label>

        <label className="field">
          <span className="field__label">Notes</span>
          <textarea
            className="field__input field__input--area"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={5}
            maxLength={2_000}
            placeholder="Add context for the next person who picks this up."
          />
        </label>

        <div className="dialog__section">
          <span className="field__label">Move to</span>
          <div className="dialog__columns">
            {props.columns.map((column) => (
              <button
                key={column.id}
                type="button"
                className={`chip${column.id === props.currentColumnId ? " chip--active" : ""}`}
                disabled={column.id === props.currentColumnId}
                onClick={() => props.onMoveTo(props.card.id, column.id)}
              >
                {column.title}
              </button>
            ))}
          </div>
        </div>

        <footer className="dialog__footer">
          <span className="dialog__meta">
            Created {new Date(props.card.createdAt).toLocaleDateString()} · id {shortId(props.card.id)}
          </span>
          <div className="dialog__actions">
            <button
              type="button"
              className={`button ${confirmDelete ? "button--danger" : "button--ghost-danger"}`}
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                props.onDelete(props.card.id);
                props.onClose();
              }}
            >
              {confirmDelete ? "Confirm delete" : "Delete"}
            </button>
            <button type="submit" className="button button--primary" disabled={!title.trim()}>
              Save changes
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
