# Syncraft Demo API

Reference backend for the Kanban demo in issue #55. It exists to dogfood
`@syncraft-labs/core` against a real HTTP API, not to be a production service.

## Stack

- [Hono](https://hono.dev/) on Node 24
- [libSQL](https://github.com/tursodatabase/libsql-client-ts) — local `file:` in
  development, hosted Turso in production
- `applyPatches` and `Patch` from `@syncraft-labs/core`

## Run locally

```bash
# From the repository root
npm install
npm run dev --workspace @syncraft-labs/demo-api
```

The API listens on `http://localhost:8787` and creates
`apps/demo-api/data/dev.db` on first boot. Copy `.env.example` to `.env` to
override the port, CORS origins, or database URL.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness probe used by Render |
| `GET` | `/api/boards/:id` | Read a board; seeds `demo` on first access |
| `POST` | `/api/boards/:id/sync` | Apply outbox patches idempotently |
| `POST` | `/api/boards/:id/reset` | Restore the seed board |
| `GET` | `/api/boards/:id/stream` | SSE updates (`hello`, `update`, `reset`, `heartbeat`) |
| `GET` | `/api/stats?boardId=demo` | Push and duplicate counters |
| `GET` | `/api/boards/:id/stats` | Same stats scoped to one board |

## Sync request

```http
POST /api/boards/demo/sync
Content-Type: application/json
X-Idempotency-Key: 9f8e7d6c5b4a3210...
X-Client-Id: tab-1

{
  "clientId": "tab-1",
  "baseVersion": 4,
  "entries": [
    {
      "id": "outbox-entry-id",
      "timestamp": 1763700000000,
      "patches": [
        { "op": "add", "path": ["cards", "card-1"], "value": { "id": "card-1", "title": "Hello", "notes": "", "createdAt": 1763700000000 } },
        { "op": "add", "path": ["columns", 0, "cardIds", 0], "value": "card-1" }
      ]
    }
  ]
}
```

The server applies every entry's patches in order, increments the board
version, and records the push. A repeated `X-Idempotency-Key` returns the
current board with `"duplicate": true` and does not increment the version.

The demo client derives the key from `SHA-256(timestamp + patches)` because
`compactOutbox()` generates a new entry ID on every call.

## Database

```sql
boards(id, state, version, updated_at)
sync_keys(board_id, idem_key, client_id, created_at)
push_log(id, board_id, client_id, entry_id, idem_key, duplicate, patch_count, received_at)
```

`GET /api/stats` exposes `totalPushes`, `duplicatePushes`, `uniqueKeys`, and a
per-client breakdown for the field-testing report.

## Deploy

The root `render.yaml` defines the API as a free Render web service. Set
`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `CORS_ORIGIN` in the Render
dashboard. Free Render services spin down after 15 minutes of inactivity; the
first request can take about a minute to wake the service.

Free Render web services have an ephemeral filesystem. A local SQLite file
would be erased on every restart, which is why production uses Turso.
