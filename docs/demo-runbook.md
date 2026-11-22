# Demo runbook — v0.9.0

Operational notes for the Kanban reference app in
[`apps/demo-web`](../apps/demo-web/README.md). The stack is a Render static site
for the UI, a free Render web service for the API, and a free Turso database for
durable SQLite.

## Local prerequisites

- Node.js 24 (`node --version`)
- npm 10
- A Chromium browser for Playwright (`npx playwright install chromium`)

## Local verification

```bash
npm install
npm run demo:typecheck
npm run demo:build
npm run demo:test
npm run demo:e2e
```

`demo:e2e` starts the API and Vite itself and uses a temporary SQLite file, so
it does not touch `apps/demo-api/data/dev.db`. To run the app by hand:

```bash
npm run demo:dev
```

- React: <http://localhost:5173/>
- Vue: <http://localhost:5173/vue.html>
- Health: <http://localhost:8787/health>

The Vite dev server proxies `/api` and `/health` to `127.0.0.1:8787`.

## First deployment

1. Create the Turso database and credentials:

   ```bash
   turso db create syncraft-demo
   turso db show syncraft-demo --url
   turso db tokens create syncraft-demo
   ```

2. In Render, create a Blueprint from this repository. `render.yaml` defines:
   - `syncraft-demo-api` — Node web service, health check `/health`
   - `syncraft-demo-web` — static site publishing `apps/demo-web/dist`

3. Set the API environment variables in Render:
   - `TURSO_DATABASE_URL` — `libsql://…` URL from step 1
   - `TURSO_AUTH_TOKEN` — token from step 1
   - `CORS_ORIGIN` — the static site origin, e.g.
     `https://syncraft-demo-web.onrender.com`
   - `RATE_LIMIT_MAX` — keep the default `120`

4. Set the static site environment variable:
   - `VITE_API_URL` — the API origin without a trailing slash, e.g.
     `https://syncraft-demo-api.onrender.com`

   `VITE_API_URL` is baked into the build. Set it before deploying the static
   site, and rebuild the site whenever the API origin changes.

5. Deploy the API first, then the static site. Confirm:

   ```bash
   curl https://<api-origin>/health
   curl https://<api-origin>/api/boards/demo
   ```

6. Open the static site, add a card, reload, and check `/api/boards/demo/stats`.
   `totalPushes` should be at least 1.

## Free-tier behavior

- Render free web services spin down after about 15 minutes of inactivity. The
  first request can take up to a minute; the UI shows a wake banner and keeps
  retrying.
- Turso free databases may archive after long inactivity. The first query can
  be slow; check the Turso dashboard if `/health` is up but board reads fail.
- Static sites do not spin down, so the UI shell should load immediately even
  while the API wakes.
- Render's filesystem is ephemeral. Never point production at a local SQLite
  file; use Turso.

## Smoke checks after deploy

```bash
API=https://<api-origin>
WEB=https://<web-origin>

curl -s "$API/health"
curl -s "$API/api/boards/demo/stats"
curl -sN "$API/api/boards/demo/stream"   # expect hello + heartbeats
curl -s -o /dev/null -w "%{http_code}\n" "$WEB/"
curl -s -o /dev/null -w "%{http_code}\n" "$WEB/vue.html"
```

### Automated live checks

The smoke script exercises health, seed, idempotent sync, duplicate handling,
stats, SSE, CORS, and both HTML entries against a throwaway board:

```bash
WEB_URL="$WEB" API_URL="$API" npm run demo:smoke:live
```

Run the browser suite against the same deployment:

```bash
E2E_WEB_URL="$WEB" E2E_API_URL="$API" npm run demo:e2e:live

# Add WebKit and Firefox desktop:
E2E_BROWSERS=chromium,webkit,firefox \
  E2E_WEB_URL="$WEB" E2E_API_URL="$API" npm run demo:e2e:live
```

PowerShell equivalent:

```powershell
$env:WEB_URL = "https://<web-origin>"
$env:API_URL = "https://<api-origin>"
npm run demo:smoke:live

$env:E2E_WEB_URL = $env:WEB_URL
$env:E2E_API_URL = $env:API_URL
$env:E2E_BROWSERS = "chromium,webkit,firefox"
npm run demo:e2e:live
```

The live suite uses one worker and a unique board per test to stay below the
write rate limit. Allow up to a minute for the first request if the API is
asleep. Install the extra engines once with
`npx playwright install webkit firefox`.

In the browser:

1. Open React and Vue on the same `?board=` ID.
2. Add a card in React; it should appear in Vue through SSE.
3. Switch Test Lab to Offline, add a card, then switch online; the outbox should
   drain and the card should survive a reload.
4. Reset the board; both tabs should return to the seed state.
5. Clear the local cache in one tab; it should reload from the API.

## Reset and recovery

- **Reset server board** calls `POST /api/boards/:id/reset` and restores the
  seed for every client on that board.
- **Clear local cache** sets a `sessionStorage` flag, reloads, and deletes the
  app's IndexedDB database before the store opens. Pending edits in that tab are
  lost; server state and other tabs are unaffected.
- If a tab gets stuck after an interrupted deploy, close it, reopen the site,
  and use **Clear local cache**. Then verify the API health endpoint.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| UI loads but board never appears | API health, `VITE_API_URL`, CORS origin |
| “API waking” banner stays up | Render spin-down; wait up to 60 s and retry |
| Push count stays at zero | Test Lab offline/permanent failure, browser devtools network tab |
| Duplicate card or stale board | Clear local cache, reload, check `/stats` |
| 429 responses | `RATE_LIMIT_MAX`; restart the API to reset the in-memory window |
| SSE disconnects immediately | Proxy buffering/CORS; EventSource reconnects automatically |

On Windows, stopping the API during an SSE smoke test can print a libuv
`UV_HANDLE_CLOSING` assertion. It happens during forced shutdown and does not
affect request handling.
