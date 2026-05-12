#!/bin/sh
# MinIO bucket setup — called by the minio-init container in docker-compose.yml
# Creates required buckets and sets public read on pmtiles bucket.

set -e

MC_ALIAS="local"
MC_HOST="${MINIO_ENDPOINT:-minio:9000}"
MC_USER="${MINIO_ACCESS_KEY:-minioadmin}"
MC_PASS="${MINIO_SECRET_KEY:-change_me_in_production}"

mc alias set "${MC_ALIAS}" "http://${MC_HOST}" "${MC_USER}" "${MC_PASS}"

# Rasters: Sentinel-1 GRDs, IMERG tiles, model outputs
mc mb --ignore-existing "${MC_ALIAS}/rasters"

# ML model weights (Sen1Floods11, XGBoost artifacts)
mc mb --ignore-existing "${MC_ALIAS}/models"

# Self-hosted PMTiles basemap — public read for MapLibre
mc mb --ignore-existing "${MC_ALIAS}/pmtiles"
mc policy set download "${MC_ALIAS}/pmtiles"

# Exports: CSV decision logs, report PDFs
mc mb --ignore-existing "${MC_ALIAS}/exports"

echo "MinIO buckets initialized."
