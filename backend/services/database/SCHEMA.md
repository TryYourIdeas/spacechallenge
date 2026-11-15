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

An import is run by `scripts/import_csv.sh <file.csv>` on a developer machine,
which writes straight to PostgreSQL in one transaction (layer id = UUIDv5 of the
file name, so a re-import replaces the layer). The `tasks` table below is the
history of the earlier queue-based importer and is no longer written.

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

## Spatial index and viewport clustering (migration `0003`)

PostGIS is enabled by migration (`CREATE EXTENSION IF NOT EXISTS postgis`, plus
`btree_gist`), because `init/` only runs for a new volume; the image already
ships both. `layer_points.geom geometry(Point, 4326)` is a **generated stored
column** from `longitude`/`latitude`, so it is backfilled for existing rows and can
never disagree with them. Index: `layer_points_geom_idx` — GiST on `(layer_id,
geom)`; viewport queries use `geom && ST_MakeEnvelope(...)` and read only one
layer's entries. Clustering groups with `ST_SnapToGrid(geom, cell)` per request
(no stored clusters, nothing to refresh; deleting a layer cascades as before).
Measured on 120k points: whole-world clustering about 120 ms, a regional viewport
about 6 ms in the database. Coordinates stay plain doubles in the API. No vector columns are involved.

Cross-layer proximity (migration `0004`): `layer_points_geog_idx` is a GiST index on
`(layer_id, (geom::geography))`. The API filter `near` becomes one correlated
`EXISTS (SELECT 1 FROM layer_points o WHERE o.layer_id = $other AND
ST_DWithin(o.geom::geography, layer_points.geom::geography, km * 1000) AND <other
layer's own filters>)` per other layer, so distance is metres on the spheroid, the
antimeridian needs no special case, and each lookup reads only that layer's index
entries. Nothing is stored or refreshed; deleting a layer removes its entries via
the existing cascade. Measured on 120k + 3k points: whole-world cluster plus count
queries 0.2 to 0.8 s.

## Layer schema and data catalog (migration `0005`)

`layer_schema(layer_id, field_key, position, label, data_type)` holds the schema of
each layer: `data_type` is one of `number | boolean | text | date`.
`layer_catalog(layer_id, field_key, value_count, missing_count, distinct_count,
filter_kind, min_number, max_number, min_text, max_text, options)` describes the
values found in `layer_points.data` for each field, so filters can be defined from it:

| Field | `filter_kind` | Filter the UI offers | Catalog carries |
| --- | --- | --- | --- |
| number | `range` | min/max range | `min_number`, `max_number` |
| text, 1 to 19 distinct values | `select` | combobox | `options` (sorted), `distinct_count` |
| text, 20+ distinct values (or none) | `text` | free text "contains" | `distinct_count` |
| boolean (JSON booleans or `true`/`false` text, any case) | `boolean` | true/false | |
| date (ISO `YYYY-MM-DD[THH:MM[:SS][Z|±hh:mm]]`) | `date_range` | date range (UI not built yet) | `min_text`, `max_text` |

A field is typed by ALL of its present values (one non-date makes a date column
text). "Missing" values (JSON null, empty/`NA`/`null`/`-999`/`-999.0` text in any case,
the number -999) are counted in `missing_count` and excluded from everything else,
matching the client's sentinel rule. The select threshold is "fewer than 20" and is
enforced by a CHECK on `options` (1 to 19 entries). A field with no present values
keeps its declared number/text type. `distinct_count` is NULL for numbers (only the
range matters).

Both tables are produced by one SQL function, `rebuild_layer_catalog(layer_id)`: it
replaces the layer's rows from the stored points in a single statement. The CSV
import calls it inside its transaction (a failure rolls the whole import back), and
migration `0005` calls it for every existing layer, so the catalog cannot drift from
the data. Deleting a layer cascades to both tables. The refresh policy is
"recompute on every import of the layer"; layers are otherwise read-only. Cost:
about 30 s for 120k points x 57 fields (one scan of `jsonb_each`). The API returns the
catalog with `GET /api/layers/:id` (`catalog` array, in column order).

Import is a single transaction (layer + points + task `done`), so a failed or
crashed attempt leaves no partial layer. No vector columns are involved.
