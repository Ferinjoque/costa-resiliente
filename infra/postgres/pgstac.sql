-- pgstac bootstrap — runs after init.sql
-- pgstac creates its own internal schema; we just need to enable the extension
-- and set the search_path so stac-fastapi can connect.

-- The timescale/timescaledb-ha image does NOT include pgstac.
-- We pull the pgstac SQL from the official release at startup via the Makefile
-- or a dedicated init container. This file documents the intent.
--
-- To install manually:
--   curl -sL https://github.com/stac-utils/pgstac/releases/latest/download/pgstac.sql | \
--     psql -h localhost -U costa -d costa_resiliente
--
-- The stac-fastapi pgstac container will run migrations automatically on startup.
-- No manual intervention needed for local dev.

SELECT 'pgstac bootstrap placeholder — migrations run via stac-fastapi container' AS status;
