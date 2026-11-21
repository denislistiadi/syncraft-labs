export type LogLevel = "info" | "success" | "warn" | "error";
export type LogSource = "sync" | "stream" | "api" | "local" | "test";

export interface LogEntry {
  readonly id: number;
  readonly at: number;
  readonly source: LogSource;
  readonly level: LogLevel;
  readonly message: string;
}

const DEFAULT_LIMIT = 60;

/**
 * Tiny observable log used by the devtools panel in both apps.
 *
 * Kept framework-agnostic so React's `useSyncExternalStore` and Vue's
 * `shallowRef` can consume the same implementation.
 */
export class EventLog {
  private entries: readonly LogEntry[] = [];
  private readonly listeners = new Set<() => void>();
  private nextId = 1;

  constructor(private readonly limit = DEFAULT_LIMIT) {}

  add(source: LogSource, level: LogLevel, message: string): void {
    const entry: LogEntry = {
      id: this.nextId,
      at: Date.now(),
      source,
      level,
      message,
    };
    this.nextId += 1;
    this.entries = [entry, ...this.entries].slice(0, this.limit);
    for (const listener of this.listeners) listener();
  }

  clear(): void {
    this.entries = [];
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): readonly LogEntry[] => this.entries;
}

export function createEventLog(limit?: number): EventLog {
  return new EventLog(limit);
}
