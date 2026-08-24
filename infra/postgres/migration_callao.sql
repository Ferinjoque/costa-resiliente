-- Migration: Callao region districts (Provincia Constitucional del Callao)
-- Apply manually: docker exec -i costa-postgres psql -U costa -d costa_resiliente < infra/postgres/migration_callao.sql
--
-- Geometries are approximate simplified polygons derived from public INEI/IGN references.
-- Replace with official INEI shapefiles for production-grade boundary accuracy.
-- ubigeo codes: 07xxxx (Callao region, INEI 2017 census)

INSERT INTO geo.districts (ubigeo, name, province, region, geom, area_km2, population)
VALUES

-- ── Callao (capital district: port area) ─────────────────────────────────────
('070101', 'Callao', 'Callao', 'Callao',
  ST_Multi(ST_GeomFromText(
    'POLYGON((-77.175 -12.020, -77.095 -12.020, -77.095 -12.075, -77.175 -12.075, -77.175 -12.020))',
    4326)),
  45.65, 415888),

-- ── Bellavista (dense residential, east of the port) ──────────────────────────
('070102', 'Bellavista', 'Callao', 'Callao',
  ST_Multi(ST_GeomFromText(
    'POLYGON((-77.115 -12.045, -77.080 -12.045, -77.080 -12.070, -77.115 -12.070, -77.115 -12.045))',
    4326)),
  4.56, 75282),

-- ── Carmen de la Legua Reynoso (small industrial/residential wedge) ────────────
('070103', 'Carmen de la Legua Reynoso', 'Callao', 'Callao',
  ST_Multi(ST_GeomFromText(
    'POLYGON((-77.110 -12.035, -77.085 -12.035, -77.085 -12.055, -77.110 -12.055, -77.110 -12.035))',
    4326)),
  2.47, 41863),

-- ── La Perla (planned residential grid south of Bellavista) ───────────────────
('070104', 'La Perla', 'Callao', 'Callao',
  ST_Multi(ST_GeomFromText(
    'POLYGON((-77.125 -12.060, -77.095 -12.060, -77.095 -12.082, -77.125 -12.082, -77.125 -12.060))',
    4326)),
  6.18, 62757),

-- ── La Punta (narrow coastal peninsula: lowest ground, high surge risk) ──────
('070105', 'La Punta', 'Callao', 'Callao',
  ST_Multi(ST_GeomFromText(
    'POLYGON((-77.175 -12.070, -77.150 -12.070, -77.150 -12.092, -77.175 -12.092, -77.175 -12.070))',
    4326)),
  0.75, 3747),

-- ── Ventanilla (large northern district, Chillón delta, active industrial) ────
-- Huayco risk from quebradas descending Ancón hills; Chillón flood plain in south.
('070106', 'Ventanilla', 'Callao', 'Callao',
  ST_Multi(ST_GeomFromText(
    'POLYGON((-77.155 -11.840, -77.070 -11.840, -77.070 -11.945, -77.155 -11.945, -77.155 -11.840))',
    4326)),
  73.52, 277182),

-- ── Mi Perú (created 2014 from SE quadrant of Ventanilla; Ley N° 30197) ───────
('070107', 'Mi Perú', 'Callao', 'Callao',
  ST_Multi(ST_GeomFromText(
    'POLYGON((-77.135 -11.895, -77.100 -11.895, -77.100 -11.922, -77.135 -11.922, -77.135 -11.895))',
    4326)),
  3.42, 57800)

ON CONFLICT (ubigeo) DO UPDATE SET
  name       = EXCLUDED.name,
  province   = EXCLUDED.province,
  region     = EXCLUDED.region,
  geom       = EXCLUDED.geom,
  area_km2   = EXCLUDED.area_km2,
  population = EXCLUDED.population;

-- Grant SELECT to AI read-only user
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'costa_ai_ro') THEN
        GRANT SELECT ON geo.districts TO costa_ai_ro;
    END IF;
END
$$;
