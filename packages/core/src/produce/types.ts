export type Path = (string | number)[];

export interface Patch {
  op: "replace" | "add" | "remove";
  path: Path;
  value?: unknown;
}
