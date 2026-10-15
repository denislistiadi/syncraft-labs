import type { Todo } from "./types.js";
import taskStyles from "./styles/Task.module.css";
import { TaskItem } from "./TaskItem.js";

interface TaskListProps {
  todos: Todo[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TaskList({ todos, onToggle, onDelete }: TaskListProps) {
  if (todos.length === 0) {
    return (
      <div className={taskStyles.emptyState}>
        <div className={taskStyles.emptyIcon}>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
        </div>
        <h3 className={taskStyles.emptyTitle}>No tasks remaining</h3>
        <p className={taskStyles.emptySubtitle}>Get started by adding a new task above.</p>
      </div>
    );
  }

  return (
    <div className={taskStyles.taskList}>
      {todos.map((todo) => (
        <TaskItem key={todo.id} todo={todo} onToggle={onToggle} onDelete={onDelete} />
      ))}
    </div>
  );
}
