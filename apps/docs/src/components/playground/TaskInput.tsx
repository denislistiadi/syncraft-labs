import { useState } from "react";
import cardStyles from "./styles/Card.module.css";

interface TaskInputProps {
  onAdd: (text: string) => void;
}

export function TaskInput({ onAdd }: TaskInputProps) {
  const [text, setText] = useState("");

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className={cardStyles.inputSection}>
      <div className={cardStyles.inputRow}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What needs to be done?"
          className={cardStyles.textInput}
          id="playground-todo-input"
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className={cardStyles.addButton}
          id="playground-add-button"
        >
          Add Task
        </button>
      </div>
    </div>
  );
}
