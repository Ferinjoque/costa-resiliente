-- migration_ubigeo_fix.sql: correct Lima Province INEI district codes.
--
-- Bug: scripts/load_lima_geodata.py listed "Magdalena Vieja" at 150121 and
-- "Pueblo Libre" at 150125. They are the same district (Pueblo Libre is the
-- modern name of Magdalena Vieja, INEI 150121), so every code from 150125
-- onward was shifted by +1 and a non-existent 150144 was invented.
--
-- Operator impact: San Juan de Lurigancho, the demo COEL district and one of
-- the highest-risk huayco districts: carried 150133, which is really San Juan
-- de Miraflores. Santiago de Surco, Villa El Salvador, Villa María del Triunfo,
-- Rímac and 15 others were likewise off by one. These codes are surfaced to
-- operators and written into EDAN-Perú exports, so they must match INEI.
--
-- Authoritative source (verified 2026-08-23): CENEPRED COEN FEN 2023 service,
--   https://sig.cenepred.gob.pe/arcgis_server/rest/services/sectores/
--     COEN_FEN_2023_10_5_1X/MapServer/4  (field id_dist)
--
-- Safe to re-run: matching is by district NAME, and rows already holding the
-- correct code are left untouched. geo.districts.id values are preserved, so
-- every foreign key (infrastructure, alerts, signals) stays intact.
--
-- Usage:
--   docker exec -i costa-postgres psql -U costa -d costa_resiliente \
--     < infra/postgres/migration_ubigeo_fix.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TEMP TABLE inei_lima_districts (ubigeo TEXT PRIMARY KEY, name TEXT NOT NULL) ON COMMIT DROP;

INSERT INTO inei_lima_districts (ubigeo, name) VALUES
    ('150101', 'Lima'),                    ('150102', 'Ancón'),
    ('150103', 'Ate'),                     ('150104', 'Barranco'),
    ('150105', 'Breña'),                   ('150106', 'Carabayllo'),
    ('150107', 'Chaclacayo'),              ('150108', 'Chorrillos'),
    ('150109', 'Cieneguilla'),             ('150110', 'Comas'),
    ('150111', 'El Agustino'),             ('150112', 'Independencia'),
    ('150113', 'Jesús María'),             ('150114', 'La Molina'),
    ('150115', 'La Victoria'),             ('150116', 'Lince'),
    ('150117', 'Los Olivos'),              ('150118', 'Lurigancho'),
    ('150119', 'Lurín'),                   ('150120', 'Magdalena del Mar'),
    ('150121', 'Pueblo Libre'),            ('150122', 'Miraflores'),
    ('150123', 'Pachacámac'),              ('150124', 'Pucusana'),
    ('150125', 'Puente Piedra'),           ('150126', 'Punta Hermosa'),
    ('150127', 'Punta Negra'),             ('150128', 'Rímac'),
    ('150129', 'San Bartolo'),             ('150130', 'San Borja'),
    ('150131', 'San Isidro'),              ('150132', 'San Juan de Lurigancho'),
    ('150133', 'San Juan de Miraflores'),  ('150134', 'San Luis'),
    ('150135', 'San Martín de Porres'),    ('150136', 'San Miguel'),
    ('150137', 'Santa Anita'),             ('150138', 'Santa María del Mar'),
    ('150139', 'Santa Rosa'),              ('150140', 'Santiago de Surco'),
    ('150141', 'Surquillo'),               ('150142', 'Villa El Salvador'),
    ('150143', 'Villa María del Triunfo');

-- Report what is about to change (visible in psql output).
SELECT d.ubigeo AS current_ubigeo, i.ubigeo AS correct_ubigeo, d.name
FROM geo.districts d
JOIN inei_lima_districts i
  ON upper(unaccent(i.name)) = upper(unaccent(d.name))
WHERE d.ubigeo IS DISTINCT FROM i.ubigeo
  AND d.ubigeo LIKE '1501%'
ORDER BY i.ubigeo;

-- Two-step swap: codes are shifted by one, so a direct UPDATE would collide
-- with the unique constraint mid-flight. Park the affected rows on a 'Z'-prefixed
-- placeholder first, then write the correct codes. The placeholder has to stay
-- six characters wide: geo.districts.ubigeo is CHAR(6).
UPDATE geo.districts d
SET ubigeo = 'Z' || right(trim(d.ubigeo), 5)
FROM inei_lima_districts i
WHERE upper(unaccent(i.name)) = upper(unaccent(d.name))
  AND d.ubigeo IS DISTINCT FROM i.ubigeo
  AND d.ubigeo LIKE '1501%';

UPDATE geo.districts d
SET ubigeo = i.ubigeo
FROM inei_lima_districts i
WHERE upper(unaccent(i.name)) = upper(unaccent(d.name))
  AND trim(d.ubigeo) LIKE 'Z%';

-- 'Magdalena Vieja' is the historical name of Pueblo Libre. If both rows exist
-- the historical one is a phantom created by the same bug; it only gets removed
-- when nothing references it.
DELETE FROM geo.districts d
WHERE upper(unaccent(d.name)) = 'MAGDALENA VIEJA'
  AND EXISTS (SELECT 1 FROM geo.districts p WHERE upper(unaccent(p.name)) = 'PUEBLO LIBRE')
  AND NOT EXISTS (SELECT 1 FROM geo.infrastructure x WHERE x.district_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM ops.alerts a WHERE a.district_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM social.signals s WHERE s.district_id = d.id);

-- Verify: no Lima district should be left on a code INEI does not define.
SELECT d.ubigeo, d.name
FROM geo.districts d
WHERE d.ubigeo LIKE '1501%'
  AND NOT EXISTS (SELECT 1 FROM inei_lima_districts i WHERE i.ubigeo = d.ubigeo)
ORDER BY d.ubigeo;

COMMIT;
