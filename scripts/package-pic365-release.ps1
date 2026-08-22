param(
  [string]$ReleaseId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [string]$OutputDirectory = '',
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path (Split-Path $repoRoot -Parent) 'releases'
}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$outputRoot = (Resolve-Path $OutputDirectory).Path
$archivePath = Join-Path $outputRoot "pic365-code-$ReleaseId.tar.gz"

if (-not $SkipBuild) {
  Push-Location $repoRoot
  try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'pic365 build failed' }
  } finally {
    Pop-Location
  }
}

$requiredPaths = @(
  'package.json',
  'package-lock.json',
  'dist',
  'server',
  'api',
  'shared',
  'deploy/pic365',
  'scripts/create-sqlite-backup.mjs',
  'scripts/check-sqlite.mjs',
  'scripts/inspect-production-db-safety.mjs'
)
foreach ($relativePath in $requiredPaths) {
  if (-not (Test-Path (Join-Path $repoRoot $relativePath))) {
    throw "Missing release path: $relativePath"
  }
}

if (Test-Path $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
Push-Location $repoRoot
try {
  & tar.exe -czf $archivePath --exclude='dist/images' --exclude='dist/images/*' @requiredPaths
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create pic365 code archive' }
} finally {
  Pop-Location
}

$entries = & tar.exe -tzf $archivePath
if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect pic365 code archive' }
if ($entries | Where-Object { $_ -match '(^|/)dist/images(/|$)' }) {
  throw 'Release archive unexpectedly contains the shared gallery'
}
if (-not ($entries | Where-Object { $_ -match '(^|/)dist/index\.html$' })) {
  throw 'Release archive does not contain dist/index.html'
}

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
$sizeBytes = (Get-Item -LiteralPath $archivePath).Length
Set-Content -LiteralPath "$archivePath.sha256" -Value "$hash  $(Split-Path $archivePath -Leaf)" -Encoding ascii

[pscustomobject]@{
  releaseId = $ReleaseId
  archive = $archivePath
  sizeMB = [math]::Round($sizeBytes / 1MB, 2)
  sha256 = $hash
  galleryIncluded = $false
}
