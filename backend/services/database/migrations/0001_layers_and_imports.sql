-- Imported CSV layers and the async jobs that create them. Additive only.
CREATE TABLE import_jobs (
  id             uuid PRIMARY KEY,
  filename       text NOT NULL,
  file_path      text NOT NULL,
  size_bytes     bigint NOT NULL CHECK (size_bytes >= 0),
  status         text NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
  attempts       integer NOT NULL DEFAULT 0,
  error          text,
  imported_rows  integer,
  skipped_rows   integer,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX import_jobs_pending_idx ON import_jobs (updated_at)
  WHERE status IN ('queued', 'processing');

-- One layer per successful import; layers.id equals import_jobs.id so a replayed
-- job rewrites the same layer instead of creating a duplicate.
CREATE TABLE layers (
  id          uuid PRIMARY KEY,
  label       text NOT NULL,
  color       text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  shape       text NOT NULL CHECK (shape IN ('circle', 'square', 'diamond', 'triangle')),
  fields      jsonb NOT NULL,
  row_count   integer NOT NULL,
  skipped     integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE layer_points (
  layer_id   uuid NOT NULL REFERENCES layers (id) ON DELETE CASCADE,
  row_idx    integer NOT NULL,
  latitude   double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude  double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  name       text,
  data       jsonb NOT NULL,
  PRIMARY KEY (layer_id, row_idx)
);
