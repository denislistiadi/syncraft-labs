import type { Todo } from "./types.js";
import taskStyles from "./styles/Task.module.css";

interface TaskItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TaskItem({ todo, onToggle, onDelete }: TaskItemProps) {
  return (
    <div className={taskStyles.taskItem}>
      <button
        onClick={() => onToggle(todo.id)}
        className={todo.done ? taskStyles.checkboxChecked : taskStyles.checkbox}
        aria-label={todo.done ? "Mark as incomplete" : "Mark as complete"}
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </button>
      <span className={todo.done ? taskStyles.taskTextDone : taskStyles.taskText}>{todo.text}</span>
      <button
        onClick={() => onDelete(todo.id)}
        className={taskStyles.deleteButton}
        title="Delete task"
        aria-label="Delete task"
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    </div>
  );
}
