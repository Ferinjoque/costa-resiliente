# generate_pmtiles.ps1: Generate Lima Metropolitana PMTiles basemap via Planetiler
#
# Prerequisites: Docker Desktop, curl (built into Windows 10+)
#
# Usage:
#   .\scripts\generate_pmtiles.ps1          # generate only
#   .\scripts\generate_pmtiles.ps1 -Upload  # generate + upload to MinIO

param(
    [switch]$Upload,
    [string]$MinioEndpoint = $env:MINIO_ENDPOINT ?? "http://localhost:9000",
    [string]$MinioAccessKey = $env:MINIO_ACCESS_KEY ?? "minioadmin",
    [string]$MinioSecretKey = $env:MINIO_SECRET_KEY ?? "change_me_in_production",
    [string]$MinioBucket = "pmtiles"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RepoRoot  = Split-Path -Parent $ScriptDir
$OutputDir = Join-Path $RepoRoot "data\pmtiles"
$OutputFile = Join-Path $OutputDir "lima-basemap.pmtiles"
$OsmExtract = Join-Path $OutputDir "lima-latest.osm.pbf"
$OsmUrl = "https://download.geofabrik.de/south-america/peru-latest.osm.pbf"
$PlanetilerImage = "ghcr.io/onthegomap/planetiler:latest"
$LimaBbox = "-77.3,-12.6,-76.6,-11.6"

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

# ─── Step 1: Download OSM extract ─────────────────────────────────────────────
if (-not (Test-Path $OsmExtract)) {
    Write-Host "[pmtiles] Downloading OSM Peru extract (~60 MB)..."
    curl.exe -L --progress-bar $OsmUrl -o $OsmExtract
} else {
    Write-Host "[pmtiles] OSM extract already at $OsmExtract: skipping download"
}

# ─── Step 2: Run Planetiler ───────────────────────────────────────────────────
Write-Host "[pmtiles] Running Planetiler (zoom 6-14, bbox $LimaBbox)..."

# Docker needs forward slashes for volume mounts on Windows
$OutputDirDocker = $OutputDir -replace '\\', '/'
$OutputDirDocker = $OutputDirDocker -replace '^([A-Z]):', { "//$($_.Groups[1].Value.ToLower())" }

docker run --rm `
    -v "${OutputDirDocker}:/data" `
    $PlanetilerImage `
    --osm-path=/data/lima-latest.osm.pbf `
    --output=/data/lima-basemap.pmtiles `
    --bounds=$LimaBbox `
    --minzoom=6 `
    --maxzoom=14 `
    "--only-layers=water,waterway,landuse,building,transportation,transportation_name,place,boundary,housenumber,poi" `
    --force

if (-not (Test-Path $OutputFile)) {
    Write-Error "[pmtiles] Planetiler did not produce output file at $OutputFile"
    exit 1
}

$SizeMB = [math]::Round((Get-Item $OutputFile).Length / 1MB, 1)
Write-Host "[pmtiles] Generated: $OutputFile ($SizeMB MB)"

# ─── Step 3: Upload to MinIO (optional) ───────────────────────────────────────
if ($Upload) {
    Write-Host "[pmtiles] Uploading to MinIO $MinioEndpoint/$MinioBucket/lima-basemap.pmtiles..."

    $uploadScript = @"
import boto3, botocore, sys
s3 = boto3.client(
    "s3",
    endpoint_url="$MinioEndpoint",
    aws_access_key_id="$MinioAccessKey",
    aws_secret_access_key="$MinioSecretKey",
    config=botocore.client.Config(signature_version="s3v4"),
)
bucket = "$MinioBucket"
try:
    s3.head_bucket(Bucket=bucket)
except Exception:
    s3.create_bucket(Bucket=bucket)
    policy = '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":"*","Action":"s3:GetObject","Resource":"arn:aws:s3:::' + bucket + '/*"}]}'
    s3.put_bucket_policy(Bucket=bucket, Policy=policy)
s3.upload_file(r"$OutputFile", bucket, "lima-basemap.pmtiles",
    ExtraArgs={"ContentType": "application/octet-stream"})
print("[pmtiles] Uploaded lima-basemap.pmtiles to", bucket)
"@

    python $uploadScript
    Write-Host "[pmtiles] Upload complete."
}

Write-Host "[pmtiles] Done. MapView will serve from:"
Write-Host "  pmtiles://$MinioEndpoint/$MinioBucket/lima-basemap.pmtiles"
