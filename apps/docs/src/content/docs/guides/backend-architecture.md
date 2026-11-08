---
title: Backend Integration
description: How to connect Syncraft Labs with traditional REST APIs (PUT/PATCH) or granular JSON Patch sync endpoints.
---

Syncraft Labs works with two backend architectures:

1. **Traditional REST API (`PUT /api/resource/:id`):** The simplest approach. Sends the full state snapshot using standard REST. Zero patch parsing required on the server.
2. **Granular Patch Sync (`POST /api/resource/:id/sync`):** Sends queued RFC 6902 JSON Patches. Best for multi-user collaboration and detailed audit logs.

---

## Approach 1: Traditional REST API (Simple `PUT`)

If you already have a standard REST API, you **do not** need a custom sync engine or JSON Patch libraries. 

Just send the state snapshot directly using `PUT` or `PATCH`.

### Client Setup

```tsx
const { data, update } = useSync<BoardState>(`board-${boardId}`, {
  initialState,

  // Standard REST GET
  fetcher: () => fetch(`/api/boards/${boardId}`).then((r) => r.json()),

  // Standard REST PUT — Syncraft triggers this automatically after local edits
  pusher: async () => {
    await fetch(`/api/boards/${boardId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data), // Sends the entire state snapshot
    });
  },
});
```

You can still use optimistic actions like `addCard`, `updateCard`, or `deleteCard`:

```tsx
const addCard = (title: string) => {
  // 1. Updates UI instantly (0ms)
  // 2. Persists to IndexedDB (survives offline)
  // 3. Syncraft automatically calls the PUT pusher above in the background
  update((draft) => {
    draft.cards[crypto.randomUUID()] = { title };
  });
};
```

### Backend (Standard REST Endpoint)

Your backend is just a regular REST route that saves the incoming JSON:

```ts
// Node.js (Express)
app.put("/api/boards/:id", async (req, res) => {
  await db.boards.update({
    where: { id: req.params.id },
    data: { content: req.body, updatedAt: new Date() },
  });
  res.json({ ok: true });
});
```

```python
# Python (FastAPI)
@app.put("/api/boards/{board_id}")
async def update_board(board_id: str, payload: dict, db = Depends(get_db)):
    await db.execute(
        "UPDATE boards SET content = :content, updated_at = NOW() WHERE id = :id",
        {"content": json.dumps(payload), "id": board_id}
    )
    return {"ok": True}
```

```go
// Go (Gin)
r.PUT("/api/boards/:id", func(c *gin.Context) {
    id := c.Param("id")
    body, _ := io.ReadAll(c.Request.Body)
    db.Exec("UPDATE boards SET content = $1, updated_at = NOW() WHERE id = $2", body, id)
    c.JSON(200, gin.H{"ok": true})
})
```

### Pros & Cons of Traditional REST

- ✅ **Super simple:** No new libraries, no patch parsing, just standard REST controllers.
- ✅ **Offline-ready:** Users can keep editing offline; changes save locally and sync with `PUT` when reconnected.
- ⚠️ **Last-Write-Wins:** If two users edit different parts of the same board offline at the same time, the last `PUT` to reach the server overwrites the earlier one. (For concurrent collaborative editing, use Approach 2 below).

---

## Approach 2: Granular Patch Sync (`POST /sync`)

When multiple users collaborate on the same document simultaneously, sending JSON Patches (RFC 6902) ensures fine-grained merging so non-overlapping edits don't overwrite each other.

### The Request Payload

A `pusher` request sends an array of `OutboxEntry` objects:

```json
[
  {
    "id": "7f8b919d-7201-4475-8025-a7bdfd94cf20",
    "timestamp": 1731051200000,
    "patches": [
      { "op": "replace", "path": ["cards", "c-1", "title"], "value": "Updated Title" },
      { "op": "add", "path": ["columns", 0, "cardIds", 1], "value": "c-2" }
    ]
  }
]
```

> **Note on Paths:** Syncraft internally stores paths as arrays (e.g. `["cards", "c-1"]`). Standard RFC 6902 JSON Patch libraries expect string pointers (e.g. `"/cards/c-1"`). You can convert them with `"/" + path.join("/")`.

---

## Database Tables (PostgreSQL Example)

```sql
-- 1. Main entity document
CREATE TABLE documents (
  id VARCHAR(64) PRIMARY KEY,
  version BIGINT NOT NULL DEFAULT 1,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Idempotency store (prevent processing retries twice)
CREATE TABLE processed_mutations (
  mutation_id UUID PRIMARY KEY,
  document_id VARCHAR(64) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Implementations

### Node.js / TypeScript (Fastify or Express)

Using `fast-json-patch`:

```bash
npm install fast-json-patch pg
```

```ts
import { applyPatch, Operation } from "fast-json-patch";

app.post("/api/documents/:id/sync", async (req, reply) => {
  const { id } = req.params;
  const entries = req.body; // OutboxEntry[]
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock row
    const { rows } = await client.query(
      "SELECT data, version FROM documents WHERE id = $1 FOR UPDATE",
      [id]
    );
    if (!rows.length) return reply.status(404).send({ error: "Not found" });

    let state = rows[0].data;
    let version = BigInt(rows[0].version);

    for (const entry of entries) {
      // 1. Idempotency check
      const exists = await client.query(
        "SELECT 1 FROM processed_mutations WHERE mutation_id = $1",
        [entry.id]
      );
      if (exists.rowCount) continue;

      // 2. Convert path arrays to RFC 6902 string pointers
      const rfcPatches = entry.patches.map((p) => ({
        ...p,
        path: Array.isArray(p.path) ? "/" + p.path.join("/") : p.path,
      })) as Operation[];

      // 3. Apply patches
      state = applyPatch(state, rfcPatches, true, false).newDocument;
      version++;

      // 4. Record mutation
      await client.query(
        "INSERT INTO processed_mutations (mutation_id, document_id) VALUES ($1, $2)",
        [entry.id, id]
      );
    }

    // Save updated state
    await client.query(
      "UPDATE documents SET data = $1, version = $2, updated_at = NOW() WHERE id = $3",
      [JSON.stringify(state), version.toString(), id]
    );

    await client.query("COMMIT");

    // Broadcast to WebSocket clients
    broadcast(id, { type: "UPDATE", data: state });

    reply.send({ status: "ok" });
  } catch (err) {
    await client.query("ROLLBACK");
    reply.status(500).send({ error: err.message });
  } finally {
    client.release();
  }
});
```

---

### Go

Using `github.com/evanphx/json-patch/v5`:

```go
package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	evanpatch "github.com/evanphx/json-patch/v5"
	"github.com/gin-gonic/gin"
)

type Patch struct {
	Op    string      `json:"op"`
	Path  interface{} `json:"path"`
	Value interface{} `json:"value,omitempty"`
}

type OutboxEntry struct {
	ID      string  `json:"id"`
	Patches []Patch `json:"patches"`
}

func HandleSync(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		docID := c.Param("id")
		var entries []OutboxEntry
		if err := c.ShouldBindJSON(&entries); err != nil {
			c.JSON(400, gin.H{"error": "Invalid payload"})
			return
		}

		tx, _ := db.Begin()
		defer tx.Rollback()

		var currentJSON []byte
		var version int64
		err := tx.QueryRow("SELECT data, version FROM documents WHERE id = $1 FOR UPDATE", docID).
			Scan(&currentJSON, &version)
		if err != nil {
			c.JSON(404, gin.H{"error": "Document not found"})
			return
		}

		for _, entry := range entries {
			var exists bool
			tx.QueryRow("SELECT EXISTS(SELECT 1 FROM processed_mutations WHERE mutation_id = $1)", entry.ID).
				Scan(&exists)
			if exists {
				continue
			}

			// Format paths to "/a/b"
			for i, p := range entry.Patches {
				if segs, ok := p.Path.([]interface{}); ok {
					var s []string
					for _, seg := range segs { s = append(s, fmt.Sprint(seg)) }
					entry.Patches[i].Path = "/" + strings.Join(s, "/")
				}
			}

			patchBytes, _ := json.Marshal(entry.Patches)
			patchObj, _ := evanpatch.DecodePatch(patchBytes)
			currentJSON, _ = patchObj.Apply(currentJSON)
			version++

			tx.Exec("INSERT INTO processed_mutations (mutation_id, document_id) VALUES ($1, $2)", entry.ID, docID)
		}

		tx.Exec("UPDATE documents SET data = $1, version = $2 WHERE id = $3", currentJSON, version, docID)
		tx.Commit()

		c.JSON(200, gin.H{"status": "ok"})
	}
}
```

---

### Python (FastAPI)

Using `jsonpatch`:

```bash
pip install fastapi jsonpatch sqlalchemy
```

```python
from fastapi import FastAPI, HTTPException
import jsonpatch

@app.post("/api/documents/{doc_id}/sync")
async def sync_document(doc_id: str, entries: list[dict], db = Depends(get_db)):
    async with db.begin():
        row = await db.fetch_one("SELECT data, version FROM documents WHERE id = :id FOR UPDATE", {"id": doc_id})
        if not row:
            raise HTTPException(404, "Not found")

        state = row["data"]

        for entry in entries:
            # Idempotency check
            exists = await db.fetch_val("SELECT 1 FROM processed_mutations WHERE mutation_id = :id", {"id": entry["id"]})
            if exists:
                continue

            # Convert path array to string pointer
            patches = [
                {
                    **p,
                    "path": "/" + "/".join(str(s) for s in p["path"]) if isinstance(p["path"], list) else p["path"]
                }
                for p in entry["patches"]
            ]

            patch = jsonpatch.JsonPatch(patches)
            state = patch.apply(state)

            await db.execute(
                "INSERT INTO processed_mutations (mutation_id, document_id) VALUES (:m_id, :doc_id)",
                {"m_id": entry["id"], "doc_id": doc_id}
            )

        await db.execute(
          "UPDATE documents SET data = :data, updated_at = NOW() WHERE id = :id",
          {"data": state, "id": doc_id}
        )

    return {"status": "ok"}
```

---

### Java (Spring Boot)

Using `com.github.fge:json-patch`:

```java
@PostMapping("/api/documents/{id}/sync")
@Transactional
public ResponseEntity<?> handleSync(@PathVariable String id, @RequestBody List<OutboxEntry> entries) {
    Document doc = docRepo.findByIdForUpdate(id)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));

    JsonNode state = doc.getData();

    for (OutboxEntry entry : entries) {
        if (mutationRepo.existsById(entry.getId())) continue;

        JsonNode patchNode = objectMapper.valueToTree(entry.getNormalizedPatches());
        JsonPatch patch = JsonPatch.fromJson(patchNode);
        state = patch.apply(state);

        mutationRepo.save(new ProcessedMutation(entry.getId(), id));
    }

    doc.setData(state);
    docRepo.save(doc);

    return ResponseEntity.ok(Map.of("status", "ok"));
}
```

---

### C# (.NET)

Using `Microsoft.AspNetCore.JsonPatch`:

```csharp
[HttpPost("/api/documents/{id}/sync")]
public async Task<IActionResult> Sync(string id, [FromBody] List<OutboxEntryDto> entries)
{
    await using var tx = await _db.Database.BeginTransactionAsync();

    var doc = await _db.Documents
        .FromSqlInterpolated($"SELECT * FROM documents WHERE id = {id} FOR UPDATE")
        .FirstOrDefaultAsync();

    if (doc == null) return NotFound();

    var jsonNode = JsonNode.Parse(doc.Data);

    foreach (var entry in entries)
    {
        if (await _db.ProcessedMutations.AnyAsync(m => m.MutationId == entry.Id))
            continue;

        ApplyPatches(jsonNode, entry.Patches);
        _db.ProcessedMutations.Add(new ProcessedMutation { MutationId = entry.Id, DocumentId = id });
    }

    doc.Data = jsonNode.ToJsonString();
    await _db.SaveChangesAsync();
    await tx.CommitAsync();

    return Ok(new { status = "ok" });
}
```

---

## Real-Time Updates (WebSocket / SSE)

After saving to the database, notify other active clients.

On the client side, pass the new state into `applyRemoteState()`:

```ts
socket.onmessage = (event) => {
  const { type, data } = JSON.parse(event.data);
  if (type === "UPDATE") {
    // Merges remote updates with any pending local outbox edits
    applyRemoteState(data);
  }
};
```
