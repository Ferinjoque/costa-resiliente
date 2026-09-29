-- CENEPRED "Escenario de riesgo por lluvias intensas asociadas a El Niño"
-- district-level risk, loaded by scripts/load_cenepred_districts.py.
--
-- Source: https://sig.cenepred.gob.pe/arcgis_server/rest/services/FEN/ER_NINO2027_BD/MapServer
--   layer 4  Riesgos a inundación
--   layer 5  Riesgos a movimientos en masa
-- Both answer anonymously. One row per (ubigeo, hazard).
SET client_encoding = 'UTF8';

CREATE TABLE IF NOT EXISTS geo.cenepred_risk (
    ubigeo           CHAR(6)  NOT NULL,
    hazard           TEXT     NOT NULL CHECK (hazard IN ('flood', 'mass_movement')),
    risk_level       TEXT     NOT NULL,   -- muy_alto | alto | medio | bajo
    vulnerability    TEXT,                -- muy_alta | alta | media | baja
    risk_value       DOUBLE PRECISION,
    susceptibility   TEXT,                -- muy_alto | alto | medio | bajo
    exposed_homes    INTEGER,             -- homes inside the susceptible zone
    exposed_schools  INTEGER,
    exposed_health   INTEGER,
    population_2017  INTEGER,
    source           TEXT     NOT NULL,
    source_url       TEXT     NOT NULL,
    raw              JSONB,
    loaded_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (ubigeo, hazard)
);
CREATE INDEX IF NOT EXISTS cenepred_risk_level_idx ON geo.cenepred_risk (hazard, risk_level);
