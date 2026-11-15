# CLI CSV Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace UI/queue-based CSV import with a local script that imports a CSV file path straight into PostgreSQL; the web app (and Vercel) only present and filter.

**Architecture:** `frontend/scripts/import-csv.ts` (run via `vite-node`) calls a new `importCsvFile(pool, path)` in `server/utils/import.ts`, reusing `analyze`/`points` from `csv.ts`, in one transaction. Layer id is a deterministic UUIDv5 of the file name, so re-running replaces the layer. The web app drops the import UI, `/api/files|imports|tasks|events`, the BullMQ worker, Redis and the `worker`/`queue` Compose services.

**Tech Stack:** Nuxt 4/Nitro, TypeScript, `pg`, `csv-parse`, vitest, `vite-node`, Docker Compose.

**Spec:** conversation design approved 2026-11-15 ("go with the plan"); no separate spec file.

## Global Constraints

- Script usage: `npm run import -- <file.csv>` (from `frontend/`) and wrapper `scripts/import_csv.sh <file.csv>`.
- `DATABASE_URL` from environment, else parsed from `backend/docker/.env`; never printed (mask password).
- One transaction; failure rolls back fully; exit code non-zero on any error.
- Layer id = UUIDv5(file basename) with a fixed project namespace; re-import replaces the layer.
- `tasks` table and migrations 0001-0003 stay untouched (immutable). No new migration.
- Vercel needs only `DATABASE_URL`; `QUEUE_URL` no longer required anywhere.
- Update `@docs/how-to-use/{config,manual,features}.md`, `README.md`, `ARCHITECTURE.md`, `DEPLOYMENT.md`, `backend/README.md` in the same change.
- Append one row to `@docs/JOURNAL.csv` at handoff.

## Review Focus

- Re-importing the same file leaves exactly one layer with the new rows (no duplicates, old points gone).
- A CSV with no valid coordinates / missing lat-lon columns fails with a clear message, exit 1, and no layer written.
- Nonexistent path, directory, or non-`.csv` path: clear error, exit 1, nothing written.
- Failure mid-import (e.g. DB error on a batch) leaves no partial layer.
- Password in `DATABASE_URL` never appears in output or errors.

---

### Task 1: `importCsvFile` core

**Files:**
- Modify: `frontend/server/utils/import.ts` (replace `processImport`/`markFailed`)
- Test: `frontend/tests/server/import.test.ts`

**Interfaces:**
- Produces: `layerIdFor(fileName: string): string` (UUIDv5, namespace constant in this file); `importCsvFile(pool: Pool, path: string, onProgress?: (done: number, total: number | null) => void): Promise<{ layerId: string; label: string; imported: number; skipped: number; replaced: boolean }>`
- Consumes: `analyze`, `points`, `ImportError` from `./csv`.

- [ ] **Step 1: Write failing tests** in `import.test.ts` using a fake `Pool` recording queries (or `TEST_DATABASE_URL` integration like `points.integration.test.ts`, skipped when unset): `layerIdFor('a.csv') === layerIdFor('a.csv')`, differs for `b.csv`, matches UUID regex; `importCsvFile` on a 3-row temp CSV returns `{imported: 3, skipped: 0}`; calling twice yields one `layers` row; CSV with only bad coordinates rejects with `ImportError` and issues `ROLLBACK`/no `layers` insert; a failing batch insert issues `ROLLBACK`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run tests/server/import.test.ts` — expect FAIL (not defined).
- [ ] **Step 3: Implement** the two functions, moving the transaction/batch/palette logic out of `processImport` (delete task/progress-row code; `replaced` = whether `DELETE FROM layers WHERE id=$1` removed a row; palette index still `count(*) % PALETTE.length`). Use `node:crypto` `createHash('sha1')` for UUIDv5.
- [ ] **Step 4: Run** the test file — expect PASS.
- [ ] **Step 5: Commit** `feat: importCsvFile core with deterministic layer id`.

### Task 2: CLI script and env loading

**Files:**
- Create: `frontend/scripts/import-csv.ts`, `frontend/server/utils/cli.ts`, `scripts/import_csv.sh`
- Modify: `frontend/package.json` (script `"import": "vite-node scripts/import-csv.ts --"`)
- Test: `frontend/tests/server/cli.test.ts`

**Interfaces:**
- Produces: `resolveDatabaseUrl(env: NodeJS.ProcessEnv, envFileText?: string): string` (env wins, else `DATABASE_URL=` line from file text, else throws); `maskUrl(url: string): string` (password → `***`); `validateCsvPath(path: string): Promise<string>` (absolute path; throws on missing, directory, non-`.csv`, empty file).
- Consumes: `importCsvFile`, `createPool` (`server/utils/db.ts`).

- [ ] **Step 1: Write failing tests**: `resolveDatabaseUrl` prefers env, falls back to file text, throws without either; `maskUrl('postgres://u:secret@h:5432/d')` contains no `secret`; `validateCsvPath` rejects missing path, a directory, `x.txt`, empty `.csv`; accepts a real `.csv`.
- [ ] **Step 2: Run** `npx vitest run tests/server/cli.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `cli.ts` helpers and `scripts/import-csv.ts` (reads `process.argv[2]`, prints usage on none, reads `../backend/docker/.env` if present, progress to stderr, summary `Imported N rows (S skipped) into layer "<label>" [replaced|new]`, `process.exit(1)` on error with message only, always `pool.end()`). `import_csv.sh` resolves relative file path to absolute, `cd frontend`, runs `npm run import -- "$abs"`.
- [ ] **Step 4: Run** cli tests — PASS.
- [ ] **Step 5: Real run** against a scratch local Postgres (`POSTGRES_IMAGE` stack, `DATABASE_URL` overridden): import `data/NASA_Moon_Training_Sites.csv` twice; `SELECT count(*) FROM layers` = 1 and points = file rows. Expected: exit 0 both times.
- [ ] **Step 6: Commit** `feat: import-csv script`.

### Task 3: Remove import from the app and server

**Files:**
- Delete: `server/api/{files.get,imports.post,events.get}.ts`, `server/api/tasks/`, `server/utils/{files,worker,queue,events,sse}.ts`, `tests/server/sse.test.ts`
- Modify: `server/utils/{services,config}.ts` (drop Redis/queue/hub, `QUEUE_URL`, `sourceDir`, `importAttempts`, `staleAfterSeconds`, `role`), `server/plugins/services.ts` (migrate only; skip on `VERCEL`), `frontend/package.json` (remove `bullmq`, `ioredis`), `app/components/LayerPanel.vue` (remove Import panel, picker, tasks list), `app/composables/useLayers.ts` (remove files/tasks/SSE/startImport), `app/types/layers.ts` (`DataFile`, `ServerTask`), `app/app.vue`, `tests/server/csv.test.ts` if it references `files.ts`
- Keep: layer deletion, layer listing, clusters/points routes.

**Interfaces:**
- Consumes: nothing new. Produces: app that needs only `DATABASE_URL`.

- [ ] **Step 1: Delete/modify** the files above; grep `rg "queue|worker|ServerTask|DataFile|startImport|loadFiles|SOURCE_DIR|QUEUE_URL" frontend` returns nothing outside `node_modules`.
- [ ] **Step 2: Run** `npx vitest run` (note host rolldown binding issue: run inside `docker build` if it fails locally) and `npx nuxt typecheck` — expect PASS.
- [ ] **Step 3: Commit** `refactor: remove UI/API import, worker and queue`.

### Task 4: Compose, Docker and deployment scripts

**Files:**
- Modify: `backend/docker/compose.yaml`, `compose.vm.yaml`, `compose.local.yaml.example`, `.env.example`, `Caddyfile` only if it references removed services, `scripts/deploy_backend.sh`, `scripts/vm_activate.sh`, `frontend/Dockerfile` (remove `/data/source` expectations), `backend/services/queue/` (delete directory + README), `.agents/skills/*` references.

- [ ] **Step 1: Remove** `worker` and `queue` services, `queue_data` volume, `QUEUE_URL`, `DATA_DIR` mount and `QUEUE_IMAGE`; `app` no longer `depends_on` queue.
- [ ] **Step 2: Run** `./backend/docker/compose.sh config --quiet` — expect exit 0.
- [ ] **Step 3: Run** `./backend/docker/compose.sh up --build --detach --wait`; expect `app` healthy, `curl localhost:8080/readyz` = ready, `/api/layers` returns the remote layers; logs clean; orphan `worker`/`queue` containers removed with `--remove-orphans`.
- [ ] **Step 4: Commit** `chore: drop worker and queue services`.

### Task 5: Docs

**Files:** `@docs/how-to-use/config.md`, `manual.md`, `features.md`, `README.md`, `frontend/README.md`, `backend/README.md`, `@docs/architecture/ARCHITECTURE.md`, `@docs/DEPLOYMENT.md`, `@docs/BOOTSTRAP.md`, `backend/services/database/SCHEMA.md`, `@docs/JOURNAL.csv`.

- [ ] **Step 1:** Document the import command, env resolution, re-import-replaces behavior, removed routes/variables, Vercel = `DATABASE_URL` only, `tasks` table now unused.
- [ ] **Step 2:** `rg -i "worker|QUEUE_URL|SOURCE_DIR|/api/imports|/api/files|/api/tasks|/api/events|Import CSV" @docs README.md frontend/README.md backend` shows only historical/journal mentions.
- [ ] **Step 3:** Append JOURNAL row (all five columns; `unavailable` for unknown telemetry).
- [ ] **Step 4: Commit** `docs: CLI import workflow`.

## Self-review

Spec coverage: script (T2), deterministic re-import (T1), removal of UI/API/worker/queue/Compose (T3-4), Vercel DATABASE_URL only (T3, T5), docs/tests (all). Names consistent: `importCsvFile`, `layerIdFor`, `resolveDatabaseUrl`, `maskUrl`, `validateCsvPath`.
