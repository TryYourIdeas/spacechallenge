-- Cross-layer proximity ("points of layer A within X km of a matching point of layer B")
-- runs ST_DWithin on geography, which only an index on the geography expression can
-- accelerate (and it handles the antimeridian). Additive only.
CREATE INDEX layer_points_geog_idx ON layer_points USING gist (layer_id, (geom::geography));
