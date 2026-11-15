-- Spatial index for viewport queries and grid clustering. Additive only.
-- PostGIS is installed in the database image but, unlike pgvector, was not enabled
-- by init/ (which runs only for a new volume), so enable it here for existing databases.
CREATE EXTENSION IF NOT EXISTS postgis;
-- Lets one GiST index cover (layer_id, geom), so a viewport query reads only that layer.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Generated from the validated latitude/longitude columns: existing rows are backfilled
-- by the table rewrite, and the geometry can never drift from the source columns.
ALTER TABLE layer_points
  ADD COLUMN geom geometry(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED;

CREATE INDEX layer_points_geom_idx ON layer_points USING gist (layer_id, geom);
