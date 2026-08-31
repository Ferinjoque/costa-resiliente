-- Migration: repair mojibake in geo.shelters
--
-- migration_shelters.sql is correct UTF-8, but it was applied through a shell
-- that transcoded to the Windows ANSI codepage, so every non-ASCII character
-- landed in the database as a literal '?'. 14 of 20 shelters carried corrupted
-- names or addresses ("Parque de la Exposici??n", "Estadio Jos?? G??lvez"),
-- visible to an operator in the shelter popup and in evacuation guidance.
--
-- Verified as stored corruption, not a display problem: octet_length(address)
-- equalled length(address) on the affected rows, so the bytes themselves were
-- replaced. That is unrecoverable in place, hence this restatement keyed on
-- indeci_code, which is ASCII and therefore survived intact.
--
-- Apply (the explicit client encoding is the point: without it this migration
-- reintroduces the very corruption it repairs):
--   docker exec -i costa-postgres psql -U costa -d costa_resiliente \
--     < infra/postgres/migration_shelter_encoding_fix.sql

SET client_encoding = 'UTF8';

UPDATE geo.shelters AS s SET name = v.name, address = v.address
FROM (VALUES
    ('LIM-001', 'Estadio Nacional - Palco Sur',   'Jr. José Díaz s/n, Lima'),
    ('LIM-002', 'Campo Marte',                    'Av. La Marina, Jesús María'),
    ('LIM-003', 'Parque de la Exposición',        'Paseo Colón, Lima Centro'),
    ('SJL-001', 'Parque Zonal Huiracocha',        'Av. Próceres de la Independencia, SJL'),
    ('SJL-002', 'Estadio Canto Grande',           'Av. El Sol, SJL'),
    ('SJL-003', 'Colegio Julio César Tello',      'Av. Gran Chimú, SJL'),
    ('CHO-001', 'Coliseo de Chosica',             'Jr. Dos de Mayo, Chosica'),
    ('CHO-002', 'Estadio Municipal de Chosica',   'Av. Centenario, Chosica'),
    ('CHO-003', 'Colegio Augusto B. Leguía',      'Jr. Loreto, Chosica'),
    ('ATE-001', 'Coliseo Gran Chimú - Ate',       'Av. Nicolás Ayllón, Ate'),
    ('ATE-002', 'Parque Zonal Carapongo',         'Av. Huarochirí, Ate'),
    ('COM-001', 'Parque Zonal Sinchi Roca',       'Av. Universitaria Norte, Comas'),
    ('OLI-001', 'Parque Zonal Lloque Yupanqui',   'Av. Universitaria, Los Olivos'),
    ('SMP-001', 'Parque Zonal Santa Rosa',        'Av. Canta Callao, San Martín de Porres'),
    ('CAR-001', 'Estadio Iván Elías Morales',     'Av. Universitaria Norte, Carabayllo'),
    ('CAR-002', 'Coliseo Municipal Carabayllo',   'Av. San Pedro, Carabayllo'),
    ('VES-001', 'Parque Zonal Manco Cápac',       'Av. El Sol, Villa El Salvador'),
    ('VES-002', 'Estadio José Gálvez',            'Av. Revolución, Villa El Salvador'),
    ('VMT-001', 'Estadio Jorge Basadre',          'Av. César Vallejo, VMT'),
    ('RIM-001', 'Parque Zonal Flor de Amancaes',  'Jr. Los Jardines, Rímac')
) AS v(indeci_code, name, address)
WHERE s.indeci_code = v.indeci_code;

UPDATE geo.shelters AS s SET notes = v.notes
FROM (VALUES
    ('LIM-001', 'Sede COEN Lima durante EMERGENCIA'),
    ('SJL-001', 'Zona de riesgo Huiracocha-Q.Canto Grande'),
    ('CHO-001', 'Zona quebrada Huaycoloro / Pedregal'),
    ('ATE-001', 'Quebrada Carapongo / Carossio'),
    ('COM-001', 'Cuenca del Chillón zona alta'),
    ('VES-001', 'Cuenca del Lurín zona baja'),
    ('RIM-001', 'Quebrada Huaycoloro margen izquierda')
) AS v(indeci_code, notes)
WHERE s.indeci_code = v.indeci_code;

-- Same transcoding damage reached one Callao district name. Keyed on ubigeo,
-- which is numeric and therefore intact.
UPDATE geo.districts SET name = 'Mi Perú' WHERE ubigeo = '070107' AND name LIKE '%??%';

-- The append-only guard on ops.decision_log carried the same corruption in its
-- own exception message, where an em dash became '???'.
CREATE OR REPLACE FUNCTION ops.prevent_decision_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'decision_log is append-only: DELETE and UPDATE are forbidden';
END;
$$ LANGUAGE plpgsql;
