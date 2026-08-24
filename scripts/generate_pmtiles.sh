#!/usr/bin/env bash
# generate_pmtiles.sh: Generate Lima Metropolitana PMTiles basemap via Planetiler
#
# Prerequisites:
#   docker (or podman), curl, mc (MinIO client) or boto3-based upload
#
# Usage:
#   ./scripts/generate_pmtiles.sh [--upload]
#
# Output:
#   data/pmtiles/lima-basemap.pmtiles  (local)
#   Uploaded to MinIO: s3://pmtiles/lima-basemap.pmtiles  (with --upload)
#
# Lima bounding box:  west=-77.3, south=-12.6, east=-76.6, north=-11.6
# Zoom range: 6-14 (14 gives ~10m tiles, sufficient for district/street ops view)
#
# Planetiler docs: https://github.com/onthegomap/planetiler

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# ─── Config ────────────────────────────────────────────────────────────────────
LIMA_BBOX="-77.3,-12.6,-76.6,-11.6"
MIN_ZOOM=6
MAX_ZOOM=14
OUTPUT_DIR="${REPO_ROOT}/data/pmtiles"
OUTPUT_FILE="${OUTPUT_DIR}/lima-basemap.pmtiles"
OSM_EXTRACT="${OUTPUT_DIR}/lima-latest.osm.pbf"
OSM_URL="https://download.geofabrik.de/south-america/peru-latest.osm.pbf"
PLANETILER_IMAGE="ghcr.io/onthegomap/planetiler:latest"

# MinIO upload config (used with --upload)
MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://localhost:9000}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-minioadmin}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-change_me_in_production}"
MINIO_BUCKET_PMTILES="${MINIO_BUCKET_PMTILES:-pmtiles}"

UPLOAD=false
if [[ "${1:-}" == "--upload" ]]; then
  UPLOAD=true
fi

mkdir -p "$OUTPUT_DIR"

# ─── Step 1: Download OSM extract ──────────────────────────────────────────────
if [[ ! -f "$OSM_EXTRACT" ]]; then
  echo "[pmtiles] Downloading OSM Peru extract (~60 MB)…"
  curl -L --progress-bar "$OSM_URL" -o "$OSM_EXTRACT"
else
  echo "[pmtiles] OSM extract already at $OSM_EXTRACT: skipping download"
fi

# ─── Step 2: Run Planetiler ────────────────────────────────────────────────────
echo "[pmtiles] Running Planetiler (zoom ${MIN_ZOOM}: ${MAX_ZOOM}, bbox ${LIMA_BBOX})…"

# Planetiler needs the OSM PBF accessible inside the container
docker run --rm \
  -v "${OUTPUT_DIR}:/data" \
  "$PLANETILER_IMAGE" \
  --osm-path=/data/lima-latest.osm.pbf \
  --output=/data/lima-basemap.pmtiles \
  --bounds="${LIMA_BBOX}" \
  --minzoom="${MIN_ZOOM}" \
  --maxzoom="${MAX_ZOOM}" \
  --only-layers=water,waterway,landuse,building,transportation,transportation_name,place,boundary,housenumber,poi \
  --force

echo "[pmtiles] Generated: $OUTPUT_FILE ($(du -sh "$OUTPUT_FILE" | cut -f1))"

# ─── Step 3: Upload to MinIO (optional) ────────────────────────────────────────
if [[ "$UPLOAD" == "true" ]]; then
  echo "[pmtiles] Uploading to MinIO ${MINIO_ENDPOINT}/${MINIO_BUCKET_PMTILES}/lima-basemap.pmtiles…"

  # Try mc (MinIO client) first, fall back to curl S3 API
  if command -v mc &>/dev/null; then
    mc alias set costa "$MINIO_ENDPOINT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" --quiet
    mc mb --ignore-existing "costa/${MINIO_BUCKET_PMTILES}"
    mc cp "$OUTPUT_FILE" "costa/${MINIO_BUCKET_PMTILES}/lima-basemap.pmtiles"
    mc anonymous set download "costa/${MINIO_BUCKET_PMTILES}/lima-basemap.pmtiles"
  else
    echo "[pmtiles] 'mc' not found: using Python boto3 upload"
    python3 - <<PYEOF
import boto3, botocore
s3 = boto3.client(
    "s3",
    endpoint_url="${MINIO_ENDPOINT}",
    aws_access_key_id="${MINIO_ACCESS_KEY}",
    aws_secret_access_key="${MINIO_SECRET_KEY}",
    config=botocore.client.Config(signature_version="s3v4"),
)
bucket = "${MINIO_BUCKET_PMTILES}"
key = "lima-basemap.pmtiles"
try:
    s3.head_bucket(Bucket=bucket)
except botocore.exceptions.ClientError:
    s3.create_bucket(Bucket=bucket)
    s3.put_bucket_policy(Bucket=bucket, Policy='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":"*","Action":"s3:GetObject","Resource":"arn:aws:s3:::' + bucket + '/*"}]}')
s3.upload_file("${OUTPUT_FILE}", bucket, key, ExtraArgs={"ContentType": "application/octet-stream"})
print(f"Uploaded {key} to {bucket}")
PYEOF
  fi

  echo "[pmtiles] Upload complete."
fi

echo "[pmtiles] Done. MapView will serve from:"
echo "  pmtiles://${MINIO_ENDPOINT}/${MINIO_BUCKET_PMTILES}/lima-basemap.pmtiles"
