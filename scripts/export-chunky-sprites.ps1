param([Parameter(Mandatory=$true)][string]$Manifest)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$artRoot = Join-Path $projectRoot 'artwork/style-unify-2026-11-19'
$assetRoot = Join-Path $projectRoot 'game/public/assets'
$sources = Get-Content -LiteralPath $Manifest -Raw | ConvertFrom-Json
foreach ($entry in $sources.PSObject.Properties) {
  if (!(Test-Path -LiteralPath ([string]$entry.Value) -PathType Leaf)) { throw "Missing generated image: $($entry.Name)" }
}
$palettes = @{
  shrimp = @('#0b1d3a','#1569bc','#278fe3','#3ccce0','#f4fbff')
  gold = @('#0b1d3a','#ff9d36','#e77323','#ffe8a0','#fff7dc')
  angel = @('#0b1d3a','#36bcd8','#167da8','#b9f6f2','#f4fbff')
  betta = @('#0b1d3a','#a290ec','#675ec0','#e2d8ff','#f4fbff')
  guppy = @('#0b1d3a','#50d5b1','#279f98','#fa7b78','#c3ffdf')
  neon = @('#0b1d3a','#38d8e3','#207abd','#f06c70','#e0fff9')
}
foreach ($entry in $sources.PSObject.Properties) {
  $kind = $entry.Name
  if (!$palettes.ContainsKey($kind)) { throw "Unknown species: $kind" }
  $sourcePath = [string]$entry.Value
  Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $artRoot "$kind-generated.png")
  $source = [System.Drawing.Bitmap]::FromFile($sourcePath)
  # 생성된 그림만 실제 게임의 24x16 논리 격자로 축소합니다. 새 그림을 코드로 그리지 않습니다.
  $logical = [System.Drawing.Bitmap]::new(48,16,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($logical)
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $graphics.DrawImage($source,[System.Drawing.Rectangle]::new(0,0,48,16),0,0,$source.Width,$source.Height,[System.Drawing.GraphicsUnit]::Pixel)
  $graphics.Dispose(); $source.Dispose()
  $palette = @($palettes[$kind] | ForEach-Object { [System.Drawing.ColorTranslator]::FromHtml($_) })
  for ($y=0;$y -lt 16;$y++) { for ($x=0;$x -lt 48;$x++) {
    $pixel = $logical.GetPixel($x,$y)
    if ($pixel.A -lt 128) { $logical.SetPixel($x,$y,[System.Drawing.Color]::Transparent); continue }
    $best = $palette[0]; $distance = [double]::PositiveInfinity
    foreach ($candidate in $palette) {
      $d = [Math]::Pow($pixel.R-$candidate.R,2)+[Math]::Pow($pixel.G-$candidate.G,2)+[Math]::Pow($pixel.B-$candidate.B,2)
      if ($d -lt $distance) { $distance=$d; $best=$candidate }
    }
    $logical.SetPixel($x,$y,$best)
  }}
  $strip = [System.Drawing.Bitmap]::new(96,32,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($strip)
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $graphics.DrawImage($logical,[System.Drawing.Rectangle]::new(0,0,96,32),0,0,48,16,[System.Drawing.GraphicsUnit]::Pixel)
  $graphics.Dispose(); $logical.Dispose()
  if ($kind -eq 'shrimp') {
    $foot=0
    for($y=0;$y -lt 32;$y++) { for($x=0;$x -lt 96;$x++) { if($strip.GetPixel($x,$y).A -gt 0) { $foot=[Math]::Max($foot,$y) } } }
    $shifted=[System.Drawing.Bitmap]::new(96,32,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics=[System.Drawing.Graphics]::FromImage($shifted)
    $graphics.CompositingMode=[System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.DrawImageUnscaled($strip,0,28-$foot)
    $graphics.Dispose(); $strip.Dispose(); $strip=$shifted
  }
  $strip.Save((Join-Path $artRoot "$kind-strip.png"),[System.Drawing.Imaging.ImageFormat]::Png)
  for($frame=0;$frame -lt 2;$frame++) {
    $suffix=if($frame -eq 0){''}else{'-2'}
    $image=$strip.Clone([System.Drawing.Rectangle]::new($frame*48,0,48,32),[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $image.Save((Join-Path $assetRoot "fish-$kind$suffix.png"),[System.Drawing.Imaging.ImageFormat]::Png)
    $image.Dispose()
  }
  $strip.Dispose()
}
# 검토용 확대 이미지도 같은 PNG를 최근접 확대해 만듭니다.
$preview=[System.Drawing.Bitmap]::new(768,456,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics=[System.Drawing.Graphics]::FromImage($preview)
$graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#edf6ff'))
$graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$graphics.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::Half
$font=[System.Drawing.Font]::new('Malgun Gothic',14)
$brush=[System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#0b1d3a'))
$index=0
$labels=@{shrimp='새우';gold='금붕어';angel='엔젤피쉬';betta='베타';guppy='구피';neon='네온테트라'}
foreach($kind in @('shrimp','gold','angel','betta','guppy','neon')) {
  $strip=[System.Drawing.Bitmap]::FromFile((Join-Path $artRoot "$kind-strip.png"))
  $left=($index%2)*384; $top=[Math]::Floor($index/2)*152
  $graphics.DrawString($labels[$kind],$font,$brush,[single]($left+12),[single]$top)
  $graphics.DrawImage($strip,[System.Drawing.Rectangle]::new($left,$top+24,384,128),0,0,96,32,[System.Drawing.GraphicsUnit]::Pixel)
  $strip.Dispose(); $index++
}
$graphics.Dispose(); $font.Dispose(); $brush.Dispose()
$preview.Save((Join-Path $artRoot 'preview.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$preview.Dispose()
Write-Output '6 species / 12 transparent 48x32 PNG frames exported.'
