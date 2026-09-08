$ErrorActionPreference = 'Stop'
$root = Join-Path (Get-Location) 'content/platform-guides'

function Replace-Required([string]$file, [string]$old, [string]$new) {
  $text = [IO.File]::ReadAllText($file)
  if (-not $text.Contains($old)) {
    if ($text.Contains($new)) { return }
    throw "Missing expected text in $file`: $old"
  }
  [IO.File]::WriteAllText($file, $text.Replace($old, $new), [Text.UTF8Encoding]::new($false))
}

$navLink = '<a href="../05-companion/index.html">Pic365精灵</a>'
foreach ($page in @('01-image-studio','02-infinite-canvas','03-ecommerce-suite','04-media-assets')) {
  $file = Join-Path $root "$page/index.html"
  $text = [IO.File]::ReadAllText($file).Replace($navLink, '')
  if ($page -eq '04-media-assets') {
    $text = $text.Replace('<a class="next" href="../05-companion/index.html">下一本：Pic365精灵 →</a>', '<a class="next" href="../index.html">返回四本手册目录 →</a>')
  }
  [IO.File]::WriteAllText($file, $text, [Text.UTF8Encoding]::new($false))
}

$copies = @(
  @('content/homepage-tutorials/05-toy-precision-retouch/screens/04-region-marked.png', 'content/platform-guides/01-image-studio/screens/05-region-marked.png'),
  @('content/homepage-tutorials/08-canvas-video-storyboard/screens/04-video-settings.png', 'content/platform-guides/02-infinite-canvas/screens/04-video-settings.png'),
  @('content/homepage-tutorials/01-backpack-store-set/screens/02-images.png', 'content/platform-guides/03-ecommerce-suite/screens/02-images.png'),
  @('content/homepage-tutorials/01-backpack-store-set/screens/03-plan.png', 'content/platform-guides/03-ecommerce-suite/screens/03-plan.png'),
  @('content/homepage-tutorials/01-backpack-store-set/screens/04-shot-list.png', 'content/platform-guides/03-ecommerce-suite/screens/04-shot-list.png'),
  @('content/homepage-tutorials/01-backpack-store-set/screens/05-generate.png', 'content/platform-guides/03-ecommerce-suite/screens/05-generate.png'),
  @('content/homepage-tutorials/01-backpack-store-set/screens/06-delivery.png', 'content/platform-guides/03-ecommerce-suite/screens/06-delivery.png')
)
foreach ($copy in $copies) {
  New-Item -ItemType Directory -Force -Path (Split-Path $copy[1]) | Out-Null
  Copy-Item -LiteralPath $copy[0] -Destination $copy[1] -Force
}

Replace-Required (Join-Path $root '01-image-studio/index.html') '../../homepage-tutorials/05-toy-precision-retouch/screens/04-region-marked.png' './screens/05-region-marked.png'
Replace-Required (Join-Path $root '02-infinite-canvas/index.html') '../../homepage-tutorials/08-canvas-video-storyboard/screens/04-video-settings.png' './screens/04-video-settings.png'
foreach ($name in @('02-images','03-plan','04-shot-list','05-generate','06-delivery')) {
  Replace-Required (Join-Path $root '03-ecommerce-suite/index.html') "../../homepage-tutorials/01-backpack-store-set/screens/$name.png" "./screens/$name.png"
}

Add-Type -AssemblyName System.Drawing
$ratio = 2066.0 / 1524.0
$images = Get-ChildItem $root -Recurse -File -Filter '*.png' | Where-Object { $_.FullName -notmatch '\\qa\\' }
foreach ($file in $images) {
  $source = [Drawing.Bitmap]::new($file.FullName)
  try {
    $targetHeight = [Math]::Floor($source.Width / $ratio)
    if ($source.Height -le $targetHeight) { continue }
    $rectangle = [Drawing.Rectangle]::new(0, 0, $source.Width, $targetHeight)
    $cropped = $source.Clone($rectangle, $source.PixelFormat)
    try {
      $temp = "$($file.FullName).crop.png"
      $cropped.Save($temp, [Drawing.Imaging.ImageFormat]::Png)
    } finally { $cropped.Dispose() }
  } finally { $source.Dispose() }
  Move-Item -LiteralPath $temp -Destination $file.FullName -Force
}

Write-Output "Updated navigation and cropped $($images.Count) guide screenshots."
