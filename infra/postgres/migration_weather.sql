-- Migration: current weather conditions for Lima Metropolitana
--
-- Closes the organiser deliverable "Must be able to display current weather
-- conditions and precipitation", including responder-relevant warnings (heat,
-- cold, fog, wind, thunderstorm). The platform already carried precipitation
-- (IMERG) and river level, but no temperature, humidity or wind.
--
-- Apply:
--   docker exec -i costa-postgres psql -U costa -d costa_resiliente \
--     < infra/postgres/migration_weather.sql

SET client_encoding = 'UTF8';

-- Fixed observation points. Kept small and named so the layer stays legible:
-- one per watershed plus the metropolitan centre and the Chosica/quebrada
-- corridor, which is where huayco decisions get made.
CREATE TABLE IF NOT EXISTS hydro.weather_points (
    id           SERIAL PRIMARY KEY,
    name         TEXT NOT NULL UNIQUE,
    watershed_id INTEGER REFERENCES geo.watersheds(id),
    lat          DOUBLE PRECISION NOT NULL,
    lon          DOUBLE PRECISION NOT NULL,
    geom         GEOMETRY(POINT, 4326)
                 GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lon, lat), 4326)) STORED,
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS weather_points_geom_idx ON hydro.weather_points USING GIST (geom);

CREATE TABLE IF NOT EXISTS hydro.weather_observations (
    time                   TIMESTAMPTZ NOT NULL,
    point_id               INTEGER NOT NULL REFERENCES hydro.weather_points(id),
    temperature_c          DOUBLE PRECISION,
    apparent_temperature_c DOUBLE PRECISION,
    humidity_pct           DOUBLE PRECISION,
    precipitation_mm       DOUBLE PRECISION,
    wind_speed_kmh         DOUBLE PRECISION,
    wind_gusts_kmh         DOUBLE PRECISION,
    wind_direction_deg     DOUBLE PRECISION,
    weather_code           INTEGER,          -- WMO 4677 present-weather code
    source                 TEXT NOT NULL DEFAULT 'open-meteo',
    raw                    JSONB,
    PRIMARY KEY (time, point_id)
);

SELECT create_hypertable(
    'hydro.weather_observations',
    'time',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS weather_obs_point_time_idx
    ON hydro.weather_observations (point_id, time DESC);

-- ─── Observation points ───────────────────────────────────────────────────────
-- Watershed link is resolved by name where the watershed exists; NULL is fine
-- for the metropolitan centre, which is not tied to one basin.
INSERT INTO hydro.weather_points (name, watershed_id, lat, lon)
VALUES
    ('Lima Centro',        NULL,                                                    -12.0464, -77.0428),
    ('Chosica / Rímac',    (SELECT id FROM geo.watersheds WHERE name = 'Rímac'),    -11.9400, -76.7000),
    ('Carabayllo / Chillón',(SELECT id FROM geo.watersheds WHERE name = 'Chillón'), -11.8960, -77.0330),
    ('Pachacámac / Lurín', (SELECT id FROM geo.watersheds WHERE name = 'Lurín'),    -12.2280, -76.8700),
    ('Callao',             NULL,                                                    -12.0566, -77.1181)
ON CONFLICT (name) DO NOTHING;
