#!/usr/bin/env node
/**
 * Post-deploy smoke checks for the Syncraft Kanban demo.
 *
 * Usage:
 *   WEB_URL=https://... API_URL=https://... npm run demo:smoke:live
 *   npm run demo:smoke:live -- --web https://... --api https://...
 *
 * The script creates a throwaway board, writes one card, retries the same
 * idempotency key, and prints the resulting stats for the field-testing report.
 */
import { randomUUID } from "node:crypto";

function argValue(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function normalizeUrl(value) {
  return value?.trim().replace(/\/+$/, "");
}

const webUrl = normalizeUrl(
  argValue("web") ?? process.env.WEB_URL ?? process.env.E2E_WEB_URL,
);
const apiUrl = normalizeUrl(
  argValue("api") ?? process.env.API_URL ?? process.env.E2E_API_URL,
);
const boardId =
  argValue("board") ??
  process.env.SMOKE_BOARD ??
  `smoke-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;

if (!webUrl || !apiUrl) {
  console.error(
    "Usage: WEB_URL=https://<web> API_URL=https://<api> npm run demo:smoke:live",
  );
  process.exit(1);
}

/** The free Render API can take about a minute to wake up. */
const requestTimeout = 90_000;
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchJson(path, init = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(requestTimeout),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${path}: ${text.slice(0, 240)}`);
  }
  return { response, body };
}

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`PASS  ${name}${detail ? ` - ${detail}` : ""}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail: message });
    console.error(`FAIL  ${name} - ${message}`);
  }
}

console.log(`\nSmoke board: ${boardId}`);
console.log(`Web:         ${webUrl}`);
console.log(`API:         ${apiUrl}`);
console.log("The first request may take up to 90s while the free API wakes.\n");

let board;
let stats;

await check("API health", async () => {
  const { body } = await fetchJson("/health");
  assert(body.ok === true, "health.ok is not true");
  assert(body.service === "syncraft-demo-api", "unexpected service name");
  return `version ${body.version}`;
});

await check("Board seed", async () => {
  const { body } = await fetchJson(
    `/api/boards/${encodeURIComponent(boardId)}`,
  );
  const state = body.state;
  assert(state && Array.isArray(state.columns), "state.columns is not an array");
  assert(
    state.columns.length === 4,
    `expected 4 columns, got ${state.columns.length}`,
  );
  assert(state.cards && typeof state.cards === "object", "state.cards is missing");
  assert(Object.keys(state.cards).length >= 7, "seed cards are missing");
  board = body;
  return `version ${body.version}, ${Object.keys(state.cards).length} cards`;
});

await check("Idempotent sync", async () => {
  assert(board, "board seed check did not complete");
  const createdAt = Date.now();
  const cardId = `smoke-card-${createdAt.toString(36)}`;
  const entryId = `smoke-entry-${createdAt.toString(36)}`;
  const idempotencyKey = `smoke-${createdAt}-${randomUUID().slice(0, 8)}`;
  const backlog = board.state.columns[0];
  assert(Array.isArray(backlog?.cardIds), "backlog column is missing");

  const payload = {
    baseVersion: board.version,
    entries: [
      {
        id: entryId,
        timestamp: createdAt,
        patches: [
          {
            op: "add",
            path: ["cards", cardId],
            value: {
              id: cardId,
              title: "Smoke test card",
              notes: "Created by the post-deploy smoke script.",
              createdAt,
            },
          },
          {
            op: "add",
            path: ["columns", 0, "cardIds", backlog.cardIds.length],
            value: cardId,
          },
        ],
      },
    ],
  };

  const headers = {
    "Content-Type": "application/json",
    "X-Client-Id": `smoke-${randomUUID().slice(0, 8)}`,
    "X-Idempotency-Key": idempotencyKey,
  };

  const first = await fetchJson(
    `/api/boards/${encodeURIComponent(boardId)}/sync`,
    { method: "POST", headers, body: JSON.stringify(payload) },
  );
  assert(first.body.duplicate === false, "first sync was reported as duplicate");
  assert(
    first.body.appliedPatches === 2,
    `expected 2 patches, got ${first.body.appliedPatches}`,
  );
  assert(
    first.body.state?.cards?.[cardId]?.title === "Smoke test card",
    "card was not applied",
  );

  const retry = await fetchJson(
    `/api/boards/${encodeURIComponent(boardId)}/sync`,
    { method: "POST", headers, body: JSON.stringify(payload) },
  );
  assert(retry.body.duplicate === true, "retry was not reported as duplicate");
  assert(
    retry.body.version === first.body.version,
    "duplicate retry changed the version",
  );
  assert(retry.body.appliedPatches === 0, "duplicate retry applied patches");

  return `version ${first.body.version}, duplicate retry rejected`;
});

await check("Push statistics", async () => {
  const { body } = await fetchJson(
    `/api/boards/${encodeURIComponent(boardId)}/stats`,
  );
  assert(body.totalPushes >= 2, `expected >= 2 pushes, got ${body.totalPushes}`);
  assert(
    body.duplicatePushes >= 1,
    `expected >= 1 duplicate, got ${body.duplicatePushes}`,
  );
  assert(body.uniqueClients >= 1, "no unique clients recorded");
  stats = body;
  return `${body.totalPushes} pushes, ${body.duplicatePushes} duplicates`;
});

await check("SSE hello", async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(
      `${apiUrl}/api/boards/${encodeURIComponent(boardId)}/stream`,
      {
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      },
    );
    assert(response.ok, `HTTP ${response.status}`);
    assert(response.body, "stream body is missing");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!buffer.includes("event: hello") && buffer.length < 8192) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
    }
    await reader.cancel().catch(() => undefined);
    assert(
      buffer.includes("event: hello"),
      `no hello event; received ${JSON.stringify(buffer.slice(0, 160))}`,
    );
    assert(buffer.includes(boardId), "hello event does not include the board ID");
    return "hello event received";
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
});

await check("CORS preflight", async () => {
  const response = await fetch(
    `${apiUrl}/api/boards/${encodeURIComponent(boardId)}`,
    {
      method: "OPTIONS",
      headers: {
        Origin: webUrl,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "content-type",
      },
      signal: AbortSignal.timeout(15_000),
    },
  );
  assert(
    response.status === 204 || response.status === 200,
    `unexpected HTTP ${response.status}`,
  );
  const allowed = response.headers.get("access-control-allow-origin");
  assert(
    allowed === webUrl || allowed === "*",
    `access-control-allow-origin is ${allowed}`,
  );
  return `allow-origin ${allowed}`;
});

async function checkHtml(path, marker) {
  const response = await fetch(`${webUrl}${path}`, {
    signal: AbortSignal.timeout(requestTimeout),
  });
  const text = await response.text();
  assert(response.ok, `HTTP ${response.status}`);
  assert(text.includes(marker), `missing ${marker}`);
  return `HTTP ${response.status}`;
}

await check("React entry", () => checkHtml("/", 'id="root"'));
await check("Vue entry", () => checkHtml("/vue.html", 'id="app"'));

const failed = results.filter((result) => !result.ok);
console.log("\nBoard stats:");
console.log(JSON.stringify(stats ?? { unavailable: true }, null, 2));

if (failed.length > 0) {
  console.error(`\n${failed.length} of ${results.length} checks failed.`);
  process.exit(1);
}

console.log(`\nAll ${results.length} checks passed.`);
