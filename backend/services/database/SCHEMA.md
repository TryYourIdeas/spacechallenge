# Database Schema

> [!IMPORTANT]
> pgvector is a first-class database capability, not an optional future add-on.
> Preserve `vector` extension support, model/dimension metadata, and vector-index
> strategy whenever designing search, recommendation, retrieval, or AI features.

The initial database volume enables the extension through
`init/001-enable-pgvector.sql`. Initialization SQL runs only when PostgreSQL
creates a new volume; application schema changes belong in `migrations/` and
must be safe for existing databases.

For every vector-bearing table, document and enforce:

- embedding model and exact vector dimensions (for example, `vector(1536)`)
- distance metric and query operator (`<=>`, `<->`, or `<#>`)
- index type and rationale (`hnsw` or `ivfflat`), plus its operational tradeoffs
- source content, chunk/version lineage, refresh policy, and deletion behavior

Do not silently replace vector search with JSON, text matching, or Redis data.
Keep vectors and their relational metadata in PostgreSQL unless a deliberate,
documented architecture change says otherwise.

Describe tables, relationships, constraints, indexes, and migration notes below.

PostgreSQL is intentionally available only to services in this Compose project.
For local inspection, use `../../docker/compose.sh exec postgres psql -U app -d app`
or add a host-port mapping in `../../docker/compose.local.yaml`.

## Imported CSV layers and tasks (migrations `0001`, `0002`)

An import reads a CSV from the server's data directory and a worker loads it.

- `tasks` (renamed from `import_jobs` by `0002`; a forward rename, not an edit
  of `0001`) — one row per background task: `kind` (`csv_import`), `source_name`,
  `status` (`queued` → `processing` → `done` | `failed`), `attempts`, user-safe
  `error`, `progress_done`/`progress_total` (rows; total is NULL while the file
  is still being scanned), `imported_rows`/`skipped_rows`. A partial unique index
  allows one active task per source file; `file_path` is legacy and unused.
- `layers` — one per successful import. `id` equals `tasks.id`, so a replayed
  task rewrites the same layer. `fields` (jsonb) lists every CSV column as
  `{key: "c<position>", label, type}`; columns are keyed by position so headers
  like `id` or `lat` cannot collide.
- `layer_points` — `(layer_id, row_idx)` primary key, `latitude`/`longitude`
  with range CHECKs, optional `name`, and `data` (jsonb) holding every column.
  Deleting a layer cascades to its points; the task row stays as history.

Import is a single transaction (layer + points + task `done`), so a failed or
crashed attempt leaves no partial layer. No vector columns are involved.
