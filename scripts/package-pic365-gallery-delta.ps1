param(
  [Parameter(Mandatory = $true)]
  [string[]]$Files,
  [string]$ReleaseId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$galleryRoot = (Resolve-Path (Join-Path $repoRoot 'data/images')).Path
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path (Split-Path $repoRoot -Parent) 'releases'
}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$outputRoot = (Resolve-Path $OutputDirectory).Path
$archivePath = Join-Path $outputRoot "pic365-gallery-delta-$ReleaseId.tar.gz"
$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) "pic365-gallery-$([guid]::NewGuid().ToString('N'))"
$stagingImages = Join-Path $stagingRoot 'images'

New-Item -ItemType Directory -Force -Path $stagingImages | Out-Null
try {
  foreach ($relativeFile in $Files) {
    if ([System.IO.Path]::IsPathRooted($relativeFile) -or $relativeFile -match '(^|[\\/])\.\.([\\/]|$)') {
      throw "Gallery file must be relative to data/images: $relativeFile"
    }
    $source = Join-Path $galleryRoot $relativeFile
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
      throw "Gallery file not found: $relativeFile"
    }
    $destination = Join-Path $stagingImages $relativeFile
    New-Item -ItemType Directory -Force -Path (Split-Path $destination -Parent) | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination
  }

  if (Test-Path $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
  Push-Location $stagingRoot
  try {
    & tar.exe -czf $archivePath images
    if ($LASTEXITCODE -ne 0) { throw 'Failed to create pic365 gallery delta archive' }
  } finally {
    Pop-Location
  }
} finally {
  $resolvedStaging = [System.IO.Path]::GetFullPath($stagingRoot)
  $resolvedTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  if ($resolvedStaging.StartsWith($resolvedTemp, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path $resolvedStaging)) {
    Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
  }
}

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
$sizeBytes = (Get-Item -LiteralPath $archivePath).Length
Set-Content -LiteralPath "$archivePath.sha256" -Value "$hash  $(Split-Path $archivePath -Leaf)" -Encoding ascii

[pscustomobject]@{
  releaseId = $ReleaseId
  archive = $archivePath
  files = $Files.Count
  sizeKB = [math]::Round($sizeBytes / 1KB, 2)
  sha256 = $hash
}
