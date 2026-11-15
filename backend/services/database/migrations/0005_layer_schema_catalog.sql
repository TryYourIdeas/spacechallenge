-- Per-layer schema and data catalog. Additive only.
--
-- layer_schema:  one row per field of each layer, with a data type of
--                number | boolean | text | date.
-- layer_catalog: one row per field, describing the values found in layer_points.data so
--                the UI knows which filter to offer:
--                  select     text field with fewer than 20 distinct values (combobox)
--                  range      number field (min/max)
--                  boolean    true/false field
--                  date_range ISO date field (min/max)
--                  text       any other text field (free text "contains")
-- Both tables are rebuilt from the data by rebuild_layer_catalog(layer_id), which the CSV
-- import calls inside its transaction, so they cannot drift from layer_points. Deleting a
-- layer cascades to both. Existing layers are backfilled at the end of this migration.
--
-- "Missing" values are excluded from distinct counts, options and min/max: JSON null,
-- empty or NA/null/-999/-999.0 strings (any case), and the number -999. This matches the
-- client's isSentinelOrNull().

CREATE TABLE layer_schema (
  layer_id   uuid    NOT NULL REFERENCES layers (id) ON DELETE CASCADE,
  field_key  text    NOT NULL CHECK (field_key ~ '^c[0-9]{1,3}$'),
  position   integer NOT NULL CHECK (position >= 0),
  label      text    NOT NULL,
  data_type  text    NOT NULL CHECK (data_type IN ('number', 'boolean', 'text', 'date')),
  PRIMARY KEY (layer_id, field_key)
);

CREATE TABLE layer_catalog (
  layer_id        uuid    NOT NULL,
  field_key       text    NOT NULL,
  value_count     integer NOT NULL CHECK (value_count >= 0),
  missing_count   integer NOT NULL CHECK (missing_count >= 0),
  -- Distinct present values; NULL for number fields (not counted: only min/max matter).
  distinct_count  integer CHECK (distinct_count >= 0),
  filter_kind     text    NOT NULL CHECK (filter_kind IN ('select', 'range', 'boolean', 'date_range', 'text')),
  min_number      double precision,
  max_number      double precision,
  min_text        text,
  max_text        text,
  -- Sorted distinct values; only for select fields (1 to 19 of them).
  options         jsonb,
  computed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (layer_id, field_key),
  FOREIGN KEY (layer_id, field_key) REFERENCES layer_schema (layer_id, field_key) ON DELETE CASCADE,
  CONSTRAINT layer_catalog_options_shape CHECK (
    (filter_kind = 'select'
       AND options IS NOT NULL AND jsonb_typeof(options) = 'array'
       AND jsonb_array_length(options) BETWEEN 1 AND 19)
    OR (filter_kind <> 'select' AND options IS NULL))
);

CREATE FUNCTION rebuild_layer_catalog(p_layer uuid) RETURNS void
LANGUAGE plpgsql AS $fn$
BEGIN
  DELETE FROM layer_schema WHERE layer_id = p_layer; -- cascades to layer_catalog

  WITH declared AS (
    SELECT f.value ->> 'key' AS field_key, f.value ->> 'label' AS label,
           f.value ->> 'type' AS declared_type, (f.ordinality - 1)::int AS position
    FROM layers l, LATERAL jsonb_array_elements(l.fields) WITH ORDINALITY AS f(value, ordinality)
    WHERE l.id = p_layer
  ),
  kv AS (
    SELECT e.key AS field_key, jsonb_typeof(e.value) AS t, e.value #>> '{}' AS txt,
           CASE WHEN jsonb_typeof(e.value) = 'number' THEN (e.value #>> '{}')::float8 END AS n
    FROM layer_points p CROSS JOIN LATERAL jsonb_each(p.data) e
    WHERE p.layer_id = p_layer
  ),
  flagged AS (
    SELECT field_key, t, txt, n,
           (t = 'null'
            OR (t = 'string' AND lower(btrim(txt)) IN ('', 'na', 'null', '-999', '-999.0'))
            OR (t = 'number' AND n = -999)) AS missing
    FROM kv
  ),
  stats AS (
    SELECT field_key,
           count(*) FILTER (WHERE missing)::int AS missing_count,
           count(*) FILTER (WHERE NOT missing)::int AS value_count,
           count(*) FILTER (WHERE NOT missing AND t = 'number')::int AS n_number,
           count(*) FILTER (WHERE NOT missing AND (t = 'boolean'
                              OR (t = 'string' AND lower(btrim(txt)) IN ('true', 'false'))))::int AS n_boolean,
           count(*) FILTER (WHERE NOT missing AND t = 'string' AND txt ~
             '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?)?$')::int AS n_date,
           count(DISTINCT txt) FILTER (WHERE NOT missing AND t <> 'number')::int AS distinct_nonnumber,
           min(n) FILTER (WHERE NOT missing AND t = 'number') AS min_number,
           max(n) FILTER (WHERE NOT missing AND t = 'number') AS max_number,
           min(txt) FILTER (WHERE NOT missing AND t = 'string') AS min_text,
           max(txt) FILTER (WHERE NOT missing AND t = 'string') AS max_text
    FROM flagged GROUP BY field_key
  ),
  typed AS (
    SELECT d.field_key, d.label, d.position,
           COALESCE(s.value_count, 0) AS value_count, COALESCE(s.missing_count, 0) AS missing_count,
           s.distinct_nonnumber, s.min_number, s.max_number, s.min_text, s.max_text,
           CASE
             WHEN COALESCE(s.value_count, 0) = 0 THEN CASE WHEN d.declared_type = 'number' THEN 'number' ELSE 'text' END
             WHEN s.n_number = s.value_count THEN 'number'
             WHEN s.n_boolean = s.value_count THEN 'boolean'
             WHEN s.n_date = s.value_count THEN 'date'
             ELSE 'text'
           END AS data_type
    FROM declared d LEFT JOIN stats s USING (field_key)
  ),
  kinded AS (
    SELECT *, CASE data_type
                WHEN 'number'  THEN 'range'
                WHEN 'boolean' THEN 'boolean'
                WHEN 'date'    THEN 'date_range'
                WHEN 'text'    THEN CASE WHEN distinct_nonnumber BETWEEN 1 AND 19 THEN 'select' ELSE 'text' END
              END AS filter_kind
    FROM typed
  ),
  opts AS (
    SELECT field_key, jsonb_agg(txt ORDER BY txt) AS options
    FROM (
      SELECT DISTINCT f.field_key, f.txt FROM flagged f
      JOIN kinded k ON k.field_key = f.field_key AND k.filter_kind = 'select'
      WHERE NOT f.missing
    ) v
    GROUP BY field_key
  ),
  ins_schema AS (
    INSERT INTO layer_schema (layer_id, field_key, position, label, data_type)
    SELECT p_layer, field_key, position, label, data_type FROM kinded
    RETURNING field_key
  )
  INSERT INTO layer_catalog (layer_id, field_key, value_count, missing_count, distinct_count,
                             filter_kind, min_number, max_number, min_text, max_text, options)
  SELECT p_layer, k.field_key, k.value_count, k.missing_count,
         CASE WHEN k.data_type = 'number' THEN NULL ELSE COALESCE(k.distinct_nonnumber, 0) END,
         k.filter_kind,
         CASE WHEN k.data_type = 'number' THEN k.min_number END,
         CASE WHEN k.data_type = 'number' THEN k.max_number END,
         CASE WHEN k.data_type = 'date' THEN k.min_text END,
         CASE WHEN k.data_type = 'date' THEN k.max_text END,
         o.options
  FROM kinded k JOIN ins_schema USING (field_key) LEFT JOIN opts o USING (field_key);
END
$fn$;

-- Backfill every layer that already exists.
SELECT rebuild_layer_catalog(id) FROM layers;
