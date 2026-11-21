import type { OutboxEntry } from "@syncraft-labs/core";
import { API_BASE_URL, getBoardId } from "./config.js";
import { getClientId, sha256Hex } from "./id.js";
import type {
  BoardResponse,
  BoardState,
  HealthResponse,
  PushStats,
  SyncResponse,
} from "./types.js";

export type ApiHealth = "unknown" | "ok" | "waking" | "error" | "offline";
export type NetworkMode = "online" | "offline";
export type FailureMode = "none" | "next" | "permanent";

export type ApiMetrics = {
  fetches: number;
  pushes: number;
  duplicates: number;
  failures: number;
  lastLatencyMs: number | null;
  lastPushAt: number | null;
};

export type ApiSnapshot = {
  readonly version: number;
  readonly health: ApiHealth;
  readonly lastError: string | null;
  readonly metrics: ApiMetrics;
};

export type ApiDiagnostics = ApiSnapshot & {
  readonly boardId: string;
  readonly clientId: string;
  readonly networkMode: NetworkMode;
  readonly failureMode: FailureMode;
  readonly latencyMs: number;
};

const RETRY_DELAYS = [500, 1_500, 3_000] as const;

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function cloneMetrics(metrics: ApiMetrics): ApiMetrics {
  return { ...metrics };
}

export interface ApiClientOptions {
  readonly boardId?: string;
  readonly baseUrl?: string;
}

export function createApiClient(options: ApiClientOptions = {}) {
  const boardId = options.boardId ?? getBoardId();
  const baseUrl = options.baseUrl ?? API_BASE_URL;
  const clientId = getClientId();

  let version = 0;
  let health: ApiHealth = "unknown";
  let lastError: string | null = null;
  let networkMode: NetworkMode = "online";
  let failureMode: FailureMode = "none";
  let latencyMs = 0;

  const metrics: ApiMetrics = {
    fetches: 0,
    pushes: 0,
    duplicates: 0,
    failures: 0,
    lastLatencyMs: null,
    lastPushAt: null,
  };

  const listeners = new Set<() => void>();
  let snapshot: ApiSnapshot = {
    version,
    health,
    lastError,
    metrics: cloneMetrics(metrics),
  };

  function emit(): void {
    snapshot = {
      version,
      health,
      lastError,
      metrics: cloneMetrics(metrics),
    };
    for (const listener of listeners) listener();
  }

  function setError(error: unknown): void {
    lastError = errorMessage(error);
  }

  async function request(
    path: string,
    init: RequestInit = {},
    requestOptions: { retries?: number; timeoutMs?: number } = {},
  ): Promise<Response> {
    if (networkMode === "offline") {
      throw new Error("Test Lab: network is offline");
    }

    if (latencyMs > 0) await sleep(latencyMs);

    const retries = requestOptions.retries ?? 0;
    const attempts = retries + 1;
    const timeoutMs = requestOptions.timeoutMs ?? 15_000;
    let lastAttemptError: unknown = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${baseUrl}${path}`, {
          ...init,
          signal: controller.signal,
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          const message = detail.length > 0 ? detail : response.statusText;
          throw new HttpError(response.status, `HTTP ${response.status}: ${message}`);
        }

        return response;
      } catch (error) {
        lastAttemptError = error;
        const retryable = !(error instanceof HttpError) || error.status >= 500;
        if (!retryable || attempt === attempts - 1) {
          throw error;
        }
        const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)] ?? 1_000;
        await sleep(delay);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastAttemptError instanceof Error
      ? lastAttemptError
      : new Error("Request failed");
  }

  async function readJson<T>(response: Response): Promise<T> {
    return (await response.json()) as T;
  }

  async function fetcher(): Promise<BoardState> {
    try {
      const response = await request(
        `/api/boards/${encodeURIComponent(boardId)}`,
        {},
        { retries: 2, timeoutMs: 20_000 },
      );
      const payload = await readJson<BoardResponse>(response);
      version = payload.version;
      health = "ok";
      lastError = null;
      metrics.fetches += 1;
      emit();
      return payload.state;
    } catch (error) {
      metrics.failures += 1;
      setError(error);
      health = networkMode === "offline" ? "offline" : "waking";
      emit();
      throw error;
    }
  }

  async function push(entries: readonly OutboxEntry<BoardState>[]): Promise<void> {
    if (entries.length === 0) return;

    if (failureMode === "permanent" || failureMode === "next") {
      const message =
        failureMode === "permanent"
          ? "Test Lab: permanent push failure"
          : "Test Lab: failed this push once";
      if (failureMode === "next") failureMode = "none";
      metrics.failures += 1;
      setError(message);
      emit();
      throw new Error(message);
    }

    const lastEntry = entries[entries.length - 1];
    const timestamp = lastEntry?.timestamp ?? Date.now();
    const keyMaterial = entries.map((entry) => ({
      timestamp: entry.timestamp,
      patches: entry.patches,
    }));
    const idempotencyKey = await sha256Hex(JSON.stringify({ timestamp, entries: keyMaterial }));

    const startedAt = performance.now();

    try {
      const response = await request(
        `/api/boards/${encodeURIComponent(boardId)}/sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Idempotency-Key": idempotencyKey,
            "X-Client-Id": clientId,
          },
          body: JSON.stringify({
            clientId,
            baseVersion: version,
            entries: entries.map((entry) => ({
              id: entry.id,
              timestamp: entry.timestamp,
              patches: entry.patches,
            })),
          }),
        },
        { retries: 2, timeoutMs: 20_000 },
      );

      const payload = await readJson<SyncResponse>(response);
      version = payload.version;
      health = "ok";
      lastError = null;
      metrics.pushes += 1;
      if (payload.duplicate) metrics.duplicates += 1;
      metrics.lastPushAt = Date.now();
      metrics.lastLatencyMs = Math.round(performance.now() - startedAt);
      emit();
    } catch (error) {
      metrics.failures += 1;
      setError(error);
      health = networkMode === "offline" ? "offline" : "waking";
      emit();
      throw error;
    }
  }

  async function reset(): Promise<BoardResponse> {
    const response = await request(
      `/api/boards/${encodeURIComponent(boardId)}/reset`,
      { method: "POST" },
      { retries: 1, timeoutMs: 20_000 },
    );
    const payload = await readJson<BoardResponse>(response);
    version = payload.version;
    lastError = null;
    emit();
    return payload;
  }

  async function checkHealth(): Promise<boolean> {
    try {
      const response = await request("/health", {}, { retries: 1, timeoutMs: 12_000 });
      await readJson<HealthResponse>(response);
      health = "ok";
      lastError = null;
      emit();
      return true;
    } catch (error) {
      setError(error);
      health = networkMode === "offline" ? "offline" : "waking";
      emit();
      return false;
    }
  }

  async function getStats(): Promise<PushStats> {
    const response = await request(
      `/api/boards/${encodeURIComponent(boardId)}/stats`,
      {},
      { retries: 1, timeoutMs: 15_000 },
    );
    return readJson<PushStats>(response);
  }

  return {
    boardId,
    clientId,
    fetcher,
    pusher: push,
    reset,
    checkHealth,
    getStats,
    getVersion: () => version,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getMetrics: () => cloneMetrics(metrics),
    getDiagnostics: (): ApiDiagnostics => ({
      ...snapshot,
      metrics: cloneMetrics(metrics),
      boardId,
      clientId,
      networkMode,
      failureMode,
      latencyMs,
    }),
    setNetworkMode: (mode: NetworkMode) => {
      networkMode = mode;
      health = mode === "offline" ? "offline" : "unknown";
      emit();
      if (mode === "online") void checkHealth();
    },
    getNetworkMode: () => networkMode,
    failNextPush: () => {
      failureMode = "next";
      emit();
    },
    setFailureMode: (mode: FailureMode) => {
      failureMode = mode;
      emit();
    },
    getFailureMode: () => failureMode,
    setLatency: (ms: number) => {
      latencyMs = Math.max(0, Math.round(ms));
      emit();
    },
    getLatency: () => latencyMs,
    streamUrl: () =>
      `${baseUrl}/api/boards/${encodeURIComponent(boardId)}/stream?clientId=${encodeURIComponent(clientId)}`,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
