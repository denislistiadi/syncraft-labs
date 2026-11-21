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

export type BoardResponse = {
  id: string;
  state: BoardState;
  version: number;
  updatedAt: number;
};

export type SyncResponse = {
  ok: true;
  boardId: string;
  version: number;
  updatedAt: number;
  state: BoardState;
  duplicate: boolean;
  appliedPatches: number;
};

export type HealthResponse = {
  ok: boolean;
  service: string;
  version: string;
  uptime: number;
};

export type ClientPushStats = {
  clientId: string;
  pushes: number;
  duplicates: number;
  lastPushAt: number | null;
};

export type PushStats = {
  boardId: string | null;
  totalPushes: number;
  duplicatePushes: number;
  uniqueKeys: number;
  uniqueClients: number;
  lastPushAt: number | null;
  clients: ClientPushStats[];
};

export type StreamEventType = "hello" | "update" | "reset";

export type StreamEvent = {
  type: StreamEventType;
  boardId: string;
  version: number;
  updatedAt?: number;
  updatedBy?: string;
  clientId?: string;
  state: BoardState;
};
