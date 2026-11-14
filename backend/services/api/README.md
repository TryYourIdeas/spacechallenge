# API service

Node 22 + Fastify. One image, two processes:

- `api` (`node src/server.js`) — HTTP API, publishes `/healthz` and `/readyz`.
- `worker` (`node src/worker.js`) — BullMQ consumer on Redis (`QUEUE_URL`).

Both apply `services/database/migrations/*.sql` on start (advisory-locked,
tracked in `schema_migrations`). CSV files are read from the server's data
directory (`SOURCE_DIR`, mounted read-only from `DATA_DIR`, default repo `data/`).

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/files` | visible `*.csv` files in the data directory |
| POST | `/api/imports` | JSON `{"file": "<name from /api/files>"}` → `202` + task; `409` if that file is already importing |
| GET | `/api/tasks`, `/api/tasks/:id` | task rows (`queued` / `processing` / `done` / `failed`) |
| GET | `/api/events` | Server-Sent Events: one `snapshot` (recent tasks), then a `task` event per change |
| GET | `/api/layers`, `/api/layers/:id` | imported layers / `{fields, rows, skipped}` |
| DELETE | `/api/layers/:id` | removes the layer and its points (the task row is kept as history) |

Flow: `POST /api/imports` inserts a `tasks` row (`queued`) and enqueues a BullMQ
job whose id is the task id. The worker marks it `processing`, scans the file
(`progressTotal` is `null`, `progressDone` = rows read), then inserts points in
batches (`progressDone` of `progressTotal`) inside one transaction, and finally
sets `done` or `failed`. Every state/progress change is saved to `tasks` and
published on the Redis channel `task-events`; each API instance forwards it to its
SSE clients. Events carry the whole task and `updatedAt`, so clients keep the
newest. Imports are replay-safe (layer id = task id); file problems are
non-retryable, other errors retry 3 times with backoff; the worker re-enqueues
tasks idle for more than 2 minutes.

CSV rules: a `lat`/`latitude` and a `lon`/`lng`/`longitude` column are required;
other columns are kept. Rows with invalid coordinates are skipped and counted.

Settings: `PORT`, `DATABASE_URL`, `QUEUE_URL`, `SOURCE_DIR`, `MIGRATIONS_DIR`,
`CORS_ORIGINS` (see `../../docker/.env.example`). Tests: `npm test`.

Known gap: there is no authentication yet, so anyone who can reach the API can
start imports and delete layers. Behind a proxy, keep response buffering off for
`/api/events` (Caddy streams `text/event-stream` as-is).
