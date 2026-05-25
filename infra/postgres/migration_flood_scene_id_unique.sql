-- migration_flood_scene_id_unique.sql
-- Adds the missing UNIQUE index on ml.flood_polygons(scene_id).
-- Required for ON CONFLICT (scene_id) upserts in auto_seed.py and flood_pipeline.py.
-- Safe to re-run (IF NOT EXISTS).
--
--   docker exec -i costa-postgres psql -U costa -d costa_resiliente \
--     < infra/postgres/migration_flood_scene_id_unique.sql

CREATE UNIQUE INDEX IF NOT EXISTS flood_polygons_scene_id_uniq
    ON ml.flood_polygons (scene_id);

SELECT 'migration_flood_scene_id_unique: done' AS status;
