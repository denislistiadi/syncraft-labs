export type Todo = {
  id: string;
  text: string;
  done: boolean;
};

export type TodoState = {
  todos: Todo[];
};
