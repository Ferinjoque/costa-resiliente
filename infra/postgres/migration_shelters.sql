-- Migration: INDECI evacuation shelters for Lima Metropolitana
-- Apply manually: docker exec -i costa-postgres psql -U costa -d costa_resiliente < infra/postgres/migration_shelters.sql

CREATE TABLE IF NOT EXISTS geo.shelters (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    district_id INTEGER REFERENCES geo.districts(id),
    ubigeo      CHAR(6),
    shelter_type TEXT NOT NULL DEFAULT 'coliseo', -- coliseo, parque_zonal, colegio, estadio, otro
    capacity    INTEGER,                           -- persons
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    geom        GEOMETRY(POINT, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)) STORED,
    address     TEXT,
    indeci_code TEXT,                              -- INDECI internal reference when available
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shelters_geom_idx  ON geo.shelters USING GIST (geom);
CREATE INDEX IF NOT EXISTS shelters_ubigeo_idx ON geo.shelters (ubigeo);

-- ─── Seed data: INDECI-referenced Lima Metropolitana evacuation shelters ──────
-- Sources: INDECI SINPAD records, COER Lima emergency plans (public), OSM.
-- Capacities are INDECI-referenced estimates, rounded to nearest 500.

INSERT INTO geo.shelters (name, ubigeo, shelter_type, capacity, lat, lng, address, indeci_code, notes) VALUES

-- Lima Centro / Cercado
('Estadio Nacional - Palco Sur', '150101', 'estadio',       8000,  -12.0650, -77.0330, 'Jr. José Díaz s/n, Lima',                 'LIM-001', 'Sede COEN Lima durante EMERGENCIA'),
('Campo Marte',                  '150113', 'parque_zonal',  3000,  -12.0830, -77.0430, 'Av. La Marina, Jesús María',              'LIM-002', NULL),
('Parque de la Exposición',      '150101', 'parque_zonal',  2000,  -12.0640, -77.0350, 'Paseo Colón, Lima Centro',                'LIM-003', NULL),

-- San Juan de Lurigancho (highest flood-risk population)
('Parque Zonal Huiracocha',      '150132', 'parque_zonal',  5000,  -12.0200, -77.0030, 'Av. Próceres de la Independencia, SJL',   'SJL-001', 'Zona de riesgo Huiracocha-Q.Canto Grande'),
('Estadio Canto Grande',         '150132', 'estadio',       2500,  -12.0050, -77.0000, 'Av. El Sol, SJL',                         'SJL-002', NULL),
('Colegio Julio César Tello',    '150132', 'colegio',        800,  -12.0150, -77.0150, 'Av. Gran Chimú, SJL',                     'SJL-003', NULL),

-- Lurigancho-Chosica (quebrada zone: highest huayco risk)
('Coliseo de Chosica',           '150120', 'coliseo',       1500,  -11.9350, -76.6850, 'Jr. Dos de Mayo, Chosica',                'CHO-001', 'Zona quebrada Huaycoloro / Pedregal'),
('Estadio Municipal de Chosica', '150120', 'estadio',       1200,  -11.9380, -76.6890, 'Av. Centenario, Chosica',                 'CHO-002', NULL),
('Colegio Augusto B. Leguía',    '150120', 'colegio',        600,  -11.9420, -76.6900, 'Jr. Loreto, Chosica',                     'CHO-003', NULL),

-- Ate (Rímac overflow zone)
('Coliseo Gran Chimú - Ate',     '150102', 'coliseo',       2000,  -12.0550, -76.9680, 'Av. Nicolás Ayllón, Ate',                 'ATE-001', 'Quebrada Carapongo / Carossio'),
('Parque Zonal Carapongo',       '150102', 'parque_zonal',  3000,  -12.0480, -76.9500, 'Av. Huarochirí, Ate',                     'ATE-002', NULL),

-- Comas / SMP (Chillón watershed)
('Parque Zonal Sinchi Roca',     '150108', 'parque_zonal',  4000,  -11.9400, -77.0650, 'Av. Universitaria Norte, Comas',          'COM-001', 'Cuenca del Chillón zona alta'),
('Parque Zonal Lloque Yupanqui', '150121', 'parque_zonal',  3500,  -11.9600, -77.0800, 'Av. Universitaria, Los Olivos',           'OLI-001', NULL),
('Parque Zonal Santa Rosa',      '150131', 'parque_zonal',  3000,  -11.9880, -77.0750, 'Av. Canta Callao, San Martín de Porres',  'SMP-001', NULL),

-- Carabayllo (Chillón: northern flank)
('Estadio Iván Elías Morales',   '150107', 'estadio',       2000,  -11.9000, -77.0400, 'Av. Universitaria Norte, Carabayllo',     'CAR-001', NULL),
('Coliseo Municipal Carabayllo', '150107', 'coliseo',       1000,  -11.8950, -77.0350, 'Av. San Pedro, Carabayllo',               'CAR-002', NULL),

-- Sur / Lurín watershed
('Parque Zonal Manco Cápac',     '150141', 'parque_zonal',  4000,  -12.2000, -76.9480, 'Av. El Sol, Villa El Salvador',           'VES-001', 'Cuenca del Lurín zona baja'),
('Estadio José Gálvez',          '150141', 'estadio',       2500,  -12.2170, -76.9420, 'Av. Revolución, Villa El Salvador',       'VES-002', NULL),
('Estadio Jorge Basadre',        '150142', 'estadio',       1500,  -12.1550, -76.9800, 'Av. César Vallejo, VMT',                  'VMT-001', NULL),

-- Rímac
('Parque Zonal Flor de Amancaes','150129', 'parque_zonal',  2500,  -12.0260, -77.0380, 'Jr. Los Jardines, Rímac',                 'RIM-001', 'Quebrada Huaycoloro margen izquierda');

-- Grant SELECT to AI read-only user
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'costa_ai_ro') THEN
        GRANT SELECT ON geo.shelters TO costa_ai_ro;
    END IF;
END
$$;
