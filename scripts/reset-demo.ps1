# Reset the demo before a recording or a live presentation.
#   powershell -ExecutionPolicy Bypass -File scripts\reset-demo.ps1
# Restores the El Niño scenario (fresh alert times, closes leftover open alerts),
# pulls the latest NASA IMERG granules and re-scores today's huayco model.
$ErrorActionPreference = "Stop"
$api = "http://localhost:8000/api/v1"

$token = (Invoke-RestMethod -Method Post -Uri "$api/auth/token" `
    -Body @{ username = "coer_lima"; password = "demo1234" }).access_token
$seed = Invoke-RestMethod -Method Post -Uri "$api/health/seed" -Headers @{ Authorization = "Bearer $token" }
Write-Host "Scenario: $($seed.status)"

# Through cmd: Windows PowerShell 5.1 turns any stderr line (Prefect prints
# warnings there) into a terminating error.
cmd /c "docker exec costa-prefect-worker python -m costa_workers.ingest.imerg 72 2>nul" | Select-Object -Last 1
cmd /c "docker exec costa-prefect-worker python -m costa_workers.ml.mass_movement live 2>nul" | Select-Object -Last 1

$h = Invoke-RestMethod -Uri "$api/health"
Write-Host "Ready: $($h.sinagerd_level), $($h.active_alerts) alerts ($($h.critical_alerts) critical)"
