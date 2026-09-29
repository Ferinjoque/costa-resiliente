-- Real NASA IMERG observations, kept apart from hydro.imerg_accumulations.
--
-- hydro.imerg_accumulations carries the El Niño demo scenario. Writing real
-- dry-season observations into it would make them the "latest" rows and erase
-- the scenario mid-demo, or worse, blend the two. Observations live here.
SET client_encoding = 'UTF8';

-- One row per half-hourly granule and basin: basin-mean rain depth (mm).
-- Cached so each run downloads only the granules it has not seen.
CREATE TABLE IF NOT EXISTS hydro.imerg_granule_means (
    granule_start TIMESTAMPTZ      NOT NULL,
    watershed_id  INTEGER          NOT NULL REFERENCES geo.watersheds(id),
    depth_mm      DOUBLE PRECISION NOT NULL,
    granule       TEXT             NOT NULL,
    PRIMARY KEY (granule_start, watershed_id)
);

-- Accumulations ending at the newest granule available, per basin.
CREATE TABLE IF NOT EXISTS hydro.imerg_observed (
    time          TIMESTAMPTZ      NOT NULL,   -- end of the newest granule used
    watershed_id  INTEGER          NOT NULL REFERENCES geo.watersheds(id),
    acc_1h_mm     DOUBLE PRECISION,
    acc_3h_mm     DOUBLE PRECISION,
    acc_6h_mm     DOUBLE PRECISION,
    acc_12h_mm    DOUBLE PRECISION,
    acc_24h_mm    DOUBLE PRECISION,
    acc_72h_mm    DOUBLE PRECISION,
    granules_72h  INTEGER          NOT NULL,   -- how many of the 144 were available
    last_granule  TEXT             NOT NULL,
    computed_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    PRIMARY KEY (time, watershed_id)
);
