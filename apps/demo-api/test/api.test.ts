import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Client } from "@libsql/client";
import type { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { BoardState } from "../src/board/types.js";
import { createDatabase } from "../src/db/client.js";
import { migrateDatabase } from "../src/db/schema.js";
import type { BoardEvent } from "../src/realtime/hub.js";
import { BoardHub } from "../src/realtime/hub.js";
import type { PushStats } from "../src/stats/repository.js";

let app: Hono;
let db: Client;
let hub: BoardHub;
let boardId: string;
let directory: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "syncraft-demo-api-"));
  db = createDatabase({ url: `file:${join(directory, "test.db")}` });
  await migrateDatabase(db);
  hub = new BoardHub();
  app = createApp({ db, hub, corsOrigins: ["*"], rateLimitMax: 1_000 });
});

beforeEach(() => {
  boardId = `board-${randomUUID().slice(0, 8)}`;
});

afterAll(() => {
  db.close();
  // Windows may keep the SQLite handle alive briefly; temp files are disposable.
  void rm(directory, { recursive: true, force: true }).catch(() => undefined);
});

function scopedApp(options: { rateLimitMax?: number; corsOrigins?: readonly string[] }): Hono {
  return createApp({
    db,
    hub,
    corsOrigins: options.corsOrigins ?? ["*"],
    rateLimitMax: options.rateLimitMax ?? 1_000,
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function getBoard(appInstance: Hono, id: string): Promise<{ id: string; state: BoardState; version: number }> {
  const response = await appInstance.request(`/api/boards/${id}`);
  expect(response.status).toBe(200);
  return json(response);
}

function syncBody(cardId: string, title = "Synced card"): Record<string, unknown> {
  return {
    clientId: "test-client",
    entries: [
      {
        id: `entry-${cardId}`,
        timestamp: 1_763_700_000_000,
        patches: [
          {
            op: "add",
            path: ["cards", cardId],
            value: {
              id: cardId,
              title,
              notes: "created by the test suite",
              createdAt: 1_763_700_000_000,
            },
          },
          {
            op: "add",
            path: ["columns", 0, "cardIds", 0],
            value: cardId,
          },
        ],
      },
    ],
  };
}

async function postSync(
  appInstance: Hono,
  id: string,
  body: Record<string, unknown>,
  idempotencyKey: string,
): Promise<Response> {
  return appInstance.request(`/api/boards/${id}/sync`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey,
      "x-client-id": "test-client",
    },
    body: JSON.stringify(body),
  });
}

describe("GET /health", () => {
  it("reports the service as healthy", async () => {
    const response = await app.request("/health");
    expect(response.status).toBe(200);

    const health = await json<{ ok: boolean; service: string }>(response);
    expect(health.ok).toBe(true);
    expect(health.service).toBe("syncraft-demo-api");
  });
});

describe("board reads", () => {
  it("seeds a board on first read and keeps the version stable", async () => {
    const first = await getBoard(app, boardId);
    const second = await getBoard(app, boardId);

    expect(first.state.columns).toHaveLength(4);
    expect(Object.keys(first.state.cards).length).toBeGreaterThan(0);
    expect(second.version).toBe(first.version);
  });

  it("rejects invalid board IDs", async () => {
    const response = await app.request("/api/boards/bad%24id");
    expect(response.status).toBe(400);
  });
});

describe("POST /sync", () => {
  it("applies patches and increments the version", async () => {
    const before = await getBoard(app, boardId);
    const response = await postSync(app, boardId, syncBody("card-a"), "key-card-a-12345678");
    expect(response.status).toBe(200);

    const result = await json<{ version: number; duplicate: boolean; state: BoardState }>(response);
    expect(result.duplicate).toBe(false);
    expect(result.version).toBe(before.version + 1);
    expect(result.state.cards["card-a"]?.title).toBe("Synced card");

    const after = await getBoard(app, boardId);
    expect(after.version).toBe(result.version);
    expect(after.state.cards["card-a"]?.title).toBe("Synced card");
    expect(after.state.columns[0]?.cardIds[0]).toBe("card-a");
  });

  it("treats a repeated idempotency key as a duplicate", async () => {
    const body = syncBody("card-b");
    const first = await postSync(app, boardId, body, "key-card-b-12345678");
    const firstResult = await json<{ version: number; duplicate: boolean }>(first);

    const second = await postSync(app, boardId, body, "key-card-b-12345678");
    const secondResult = await json<{ version: number; duplicate: boolean; appliedPatches: number }>(second);

    expect(second.status).toBe(200);
    expect(firstResult.duplicate).toBe(false);
    expect(secondResult.duplicate).toBe(true);
    expect(secondResult.version).toBe(firstResult.version);
    expect(secondResult.appliedPatches).toBe(0);

    const board = await getBoard(app, boardId);
    expect(Object.keys(board.state.cards).filter((id) => id === "card-b")).toHaveLength(1);

    const stats = await json<PushStats>(
      await app.request(`/api/boards/${boardId}/stats`),
    );
    expect(stats.totalPushes).toBe(2);
    expect(stats.duplicatePushes).toBe(1);
    expect(stats.uniqueKeys).toBe(1);
    expect(stats.uniqueClients).toBe(1);
    expect(stats.clients[0]?.clientId).toBe("test-client");
  });

  it("rejects malformed patches without changing the board", async () => {
    const before = await getBoard(app, boardId);
    const response = await postSync(
      app,
      boardId,
      {
        entries: [
          {
            id: "bad-entry",
            timestamp: 1,
            patches: [{ op: "move", path: ["cards"] }],
          },
        ],
      },
      "key-invalid-patch-1234",
    );

    expect(response.status).toBe(400);
    const after = await getBoard(app, boardId);
    expect(after.version).toBe(before.version);
  });
});

describe("POST /reset", () => {
  it("restores the seed board and increments the version", async () => {
    await postSync(app, boardId, syncBody("card-c"), "key-card-c-12345678");
    const beforeReset = await getBoard(app, boardId);

    const response = await app.request(`/api/boards/${boardId}/reset`, { method: "POST" });
    expect(response.status).toBe(200);

    const result = await json<{ state: BoardState; version: number }>(response);
    expect(result.version).toBe(beforeReset.version + 1);
    expect(result.state.cards["card-c"]).toBeUndefined();
    expect(result.state.cards["offline-mode"]).toBeDefined();
  });
});

describe("SSE hub", () => {
  it("publishes an update event after a successful sync", async () => {
    const events: BoardEvent[] = [];
    const unsubscribe = hub.subscribe(boardId, (event) => {
      events.push(event);
    });

    await postSync(app, boardId, syncBody("card-d"), "key-card-d-12345678");
    unsubscribe();

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("update");
    expect(events[0]?.updatedBy).toBe("test-client");
    expect(events[0]?.state.cards["card-d"]).toBeDefined();
  });
});

describe("security middleware", () => {
  it("allows configured origins and omits the header for others", async () => {
    const scoped = scopedApp({ corsOrigins: ["https://allowed.example"] });

    const allowed = await scoped.request("/health", {
      headers: { origin: "https://allowed.example" },
    });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://allowed.example");

    const denied = await scoped.request("/health", {
      headers: { origin: "https://evil.example" },
    });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("returns 429 after the write limit is exceeded", async () => {
    const limited = scopedApp({ rateLimitMax: 1 });
    const limitedBoardId = `board-${randomUUID().slice(0, 8)}`;

    const first = await postSync(
      limited,
      limitedBoardId,
      syncBody("card-e"),
      "key-card-e-12345678",
    );
    const second = await postSync(
      limited,
      limitedBoardId,
      syncBody("card-e"),
      "key-card-e-12345678",
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).not.toBeNull();
  });
});
