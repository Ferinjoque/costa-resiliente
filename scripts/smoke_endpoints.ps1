$ErrorActionPreference = 'Continue'
$base = 'http://localhost:8000/api/v1'
$results = @()

function Hit($method, $path, $auth=$null, $body=$null) {
  $url = "$base$path"
  $hdrs = @{}
  if ($auth) { $hdrs['Authorization'] = "Bearer $auth" }
  if ($body) { $hdrs['Content-Type'] = 'application/json' }
  try {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    if ($body) {
      $r = Invoke-WebRequest -Uri $url -Method $method -Headers $hdrs -Body $body -UseBasicParsing -TimeoutSec 30
    } else {
      $r = Invoke-WebRequest -Uri $url -Method $method -Headers $hdrs -UseBasicParsing -TimeoutSec 30
    }
    $sw.Stop()
    $len = if ($r.Content) { $r.Content.Length } else { 0 }
    return [pscustomobject]@{method=$method; path=$path; status=$r.StatusCode; ms=$sw.ElapsedMilliseconds; bytes=$len; ok=$true; err=$null}
  } catch {
    return [pscustomobject]@{method=$method; path=$path; status=$_.Exception.Response.StatusCode.value__; ms=0; bytes=0; ok=$false; err=$_.Exception.Message}
  }
}

# Auth first
$tokRes = Invoke-WebRequest -Uri "$base/auth/token" -Method POST -Body @{username='coen_lima';password='demo1234'} -UseBasicParsing
$tok = ($tokRes.Content | ConvertFrom-Json).access_token
Write-Host "Token: $($tok.Substring(0,20))..."

$endpoints = @(
  @('GET','/health',$null,$null),
  @('GET','/health/seed',$null,$null),
  @('GET','/health/scraper',$null,$null),
  @('GET','/districts',$null,$null),
  @('GET','/districts/risk-summary',$null,$null),
  @('GET','/districts/150101',$null,$null),
  @('GET','/districts/150101/dashboard',$null,$null),
  @('GET','/districts/150101/watersheds',$null,$null),
  @('GET','/layers/imerg/latest',$null,$null),
  @('GET','/layers/flood/latest',$null,$null),
  @('GET','/layers/flood/exposure',$null,$null),
  @('GET','/layers/huayco/susceptibility',$null,$null),
  @('GET','/layers/hazard',$null,$null),
  @('GET','/layers/infrastructure',$null,$null),
  @('GET','/layers/stations',$null,$null),
  @('GET','/layers/watersheds',$null,$null),
  @('GET','/layers/quebradas',$null,$null),
  @('GET','/layers/social',$null,$null),
  @('GET','/alerts',$null,$null),
  @('GET','/alerts/decision-log',$null,$null),
  @('GET','/alerts/decision-log/export',$null,$null),
  @('GET','/fusion/150101',$null,$null),
  @('GET','/proposals',$tok,$null),
  @('GET','/notifications',$tok,$null),
  @('GET','/notifications/deliveries',$tok,$null),
  @('GET','/auth/me',$tok,$null),
  @('GET','/auth/operators',$tok,$null)
)

foreach ($e in $endpoints) {
  $r = Hit -method $e[0] -path $e[1] -auth $e[2] -body $e[3]
  $results += $r
  $tag = if ($r.ok) { 'OK ' } else { 'FAIL' }
  Write-Host ("{0} {1,3} {2,5}ms {3,7}B {4} {5}" -f $tag, $r.status, $r.ms, $r.bytes, $r.method.PadRight(4), $r.path)
}

# Copilot
Write-Host "`n--- COPILOT ---"
$body = '{"query":"que distritos estan en mayor riesgo?","operator_id":"coen_lima","lang":"es"}'
$r = Hit -method 'POST' -path '/copilot/ask' -auth $null -body $body
$results += $r
Write-Host ("{0} {1,3} {2,5}ms {3,7}B POST /copilot/ask" -f $(if ($r.ok){'OK '}else{'FAIL'}), $r.status, $r.ms, $r.bytes)

Write-Host "`n--- SUMMARY ---"
$pass = ($results | Where-Object {$_.ok}).Count
$fail = ($results | Where-Object {-not $_.ok}).Count
Write-Host "Pass: $pass / Total: $($results.Count)"
if ($fail -gt 0) {
  Write-Host "FAILURES:"
  $results | Where-Object {-not $_.ok} | ForEach-Object { Write-Host ("  {0} {1} -> {2}" -f $_.method, $_.path, $_.err) }
}
$results | ConvertTo-Json -Depth 3 | Out-File "$PSScriptRoot\smoke_results.json" -Encoding utf8
