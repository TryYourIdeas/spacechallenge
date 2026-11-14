-- Turns the upload-oriented import_jobs table into a general tasks table.
-- Rows and the layers.id == task id contract are preserved. Imports now read
-- files from the server's data directory, so file_path becomes optional/legacy.
ALTER TABLE import_jobs RENAME TO tasks;
ALTER TABLE tasks RENAME CONSTRAINT import_jobs_pkey TO tasks_pkey;
ALTER INDEX import_jobs_pending_idx RENAME TO tasks_pending_idx;
ALTER TABLE tasks RENAME COLUMN filename TO source_name;
ALTER TABLE tasks ALTER COLUMN file_path DROP NOT NULL;
ALTER TABLE tasks DROP CONSTRAINT import_jobs_status_check;
UPDATE tasks SET status = 'done' WHERE status = 'succeeded';
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('queued', 'processing', 'done', 'failed'));
ALTER TABLE tasks
  ADD COLUMN kind text NOT NULL DEFAULT 'csv_import',
  ADD COLUMN progress_done bigint NOT NULL DEFAULT 0,
  ADD COLUMN progress_total bigint;
-- At most one active import per source file.
CREATE UNIQUE INDEX tasks_active_source_idx ON tasks (source_name)
  WHERE status IN ('queued', 'processing');
CREATE INDEX tasks_created_idx ON tasks (created_at DESC);
