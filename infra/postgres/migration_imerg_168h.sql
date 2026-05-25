-- Migration: add 168h (7-day) accumulation column to imerg_accumulations
-- Required by huayco_model.py rain_7d_mm feature (Castro-Cabrera et al. 2024)
ALTER TABLE hydro.imerg_accumulations
    ADD COLUMN IF NOT EXISTS acc_168h_mm DOUBLE PRECISION;
