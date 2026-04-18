-- Migration: V005__world_land_polygons.sql
-- Description: Static geometry table for routing intersection lookups effectively.

CREATE TABLE IF NOT EXISTS world_land_polygons (
    id SERIAL PRIMARY KEY,
    geom GEOMETRY(Geometry, 4326)
);

CREATE INDEX IF NOT EXISTS ix_world_land_polygons_geom
    ON world_land_polygons USING GIST (geom);
