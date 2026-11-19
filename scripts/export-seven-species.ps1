param([string]$Manifest='artwork/seven-species-2026-11-20/sources.json')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot=Split-Path -Parent $PSScriptRoot
$artRoot=Join-Path $projectRoot 'artwork/seven-species-2026-11-20'
$exportRoot=Join-Path $artRoot 'exported'
New-Item -ItemType Directory -Path $exportRoot -Force | Out-Null
$sources=Get-Content -LiteralPath (Join-Path $projectRoot $Manifest) -Raw | ConvertFrom-Json
$labels=[ordered]@{gold='금붕어';guppy='구피';betta='베타';neon='네온테트라';shrimp='새우';angel='엔젤피쉬';starfish='불가사리'}
$palettes=@{
  gold=@('#0b1d3a','#ff9a35','#de662d','#ffe5a0','#ffd05f','#fff8e0')
  guppy=@('#0b1d3a','#50cfb4','#229c9b','#c8f5de','#f47e86','#d65b75','#fff8ed')
  betta=@('#0b1d3a','#6c78dc','#4656a5','#b784dc','#ed86b7','#ded7ff','#f6efff')
  neon=@('#0b1d3a','#45cbe9','#277fc1','#ee626d','#d6eff9','#fff9ee')
  shrimp=@('#0b1d3a','#248cd4','#1563aa','#55d1df','#c8f2ee','#f4fbff')
  angel=@('#0b1d3a','#54c5d4','#347aa1','#d2f0ed','#ecd18b','#fff8e6')
  starfish=@('#0b1d3a','#f18468','#d66f58','#ffd1a1','#fff3ce')
}
$catalog=[ordered]@{}
foreach($kind in $labels.Keys){
  $sourcePath=[string]$sources.$kind
  if(!(Test-Path -LiteralPath $sourcePath -PathType Leaf)){throw "Missing generated image: $kind"}
  Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $artRoot "$kind-generated.png")
  $source=[System.Drawing.Bitmap]::FromFile($sourcePath)
  $logical=[System.Drawing.Bitmap]::new(64,20,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics=[System.Drawing.Graphics]::FromImage($logical)
  $graphics.CompositingMode=[System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $graphics.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $graphics.DrawImage($source,[System.Drawing.Rectangle]::new(0,0,64,20),0,0,$source.Width,$source.Height,[System.Drawing.GraphicsUnit]::Pixel)
  $graphics.Dispose();$source.Dispose()
  $palette=@($palettes[$kind] | ForEach-Object {[System.Drawing.ColorTranslator]::FromHtml($_)})
  for($y=0;$y -lt 20;$y++){for($x=0;$x -lt 64;$x++){
    $pixel=$logical.GetPixel($x,$y)
    if($pixel.A -lt 128){$logical.SetPixel($x,$y,[System.Drawing.Color]::Transparent);continue}
    $nearest=$palette[0];$best=[double]::PositiveInfinity
    foreach($candidate in $palette){
      $d=[Math]::Pow($pixel.R-$candidate.R,2)+[Math]::Pow($pixel.G-$candidate.G,2)+[Math]::Pow($pixel.B-$candidate.B,2)
      if($d -lt $best){$best=$d;$nearest=$candidate}
    }
    $logical.SetPixel($x,$y,$nearest)
  }}
  $strip=[System.Drawing.Bitmap]::new(128,40,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics=[System.Drawing.Graphics]::FromImage($strip)
  $graphics.CompositingMode=[System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $graphics.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $graphics.DrawImage($logical,[System.Drawing.Rectangle]::new(0,0,128,40),0,0,64,20,[System.Drawing.GraphicsUnit]::Pixel)
  $graphics.Dispose();$logical.Dispose()
  if($kind -in @('shrimp','starfish')){
    $foot=0;for($y=0;$y -lt 40;$y++){for($x=0;$x -lt 128;$x++){if($strip.GetPixel($x,$y).A -gt 0){$foot=[Math]::Max($foot,$y)}}}
    $shifted=[System.Drawing.Bitmap]::new(128,40,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics=[System.Drawing.Graphics]::FromImage($shifted)
    $graphics.CompositingMode=[System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.DrawImageUnscaled($strip,0,35-$foot)
    $graphics.Dispose();$strip.Dispose();$strip=$shifted
  }
  $strip.Save((Join-Path $artRoot "$kind-strip.png"),[System.Drawing.Imaging.ImageFormat]::Png)
  $frames=@()
  for($frame=0;$frame -lt 2;$frame++){
    $suffix=if($frame -eq 0){''}else{'-2'}
    $filename="$kind$suffix.png"
    $image=$strip.Clone([System.Drawing.Rectangle]::new($frame*64,0,64,40),[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $solid=0;for($y=0;$y -lt 40;$y++){for($x=0;$x -lt 64;$x++){if($image.GetPixel($x,$y).A -gt 0){$solid++}}}
    if($solid -lt 100){throw "Empty sprite: $filename"}
    $image.Save((Join-Path $exportRoot $filename),[System.Drawing.Imaging.ImageFormat]::Png)
    $image.Dispose();$frames+=('assets/creatures/'+$filename)
  }
  $strip.Dispose()
  if((Get-FileHash -LiteralPath (Join-Path $exportRoot "$kind.png")).Hash -eq (Get-FileHash -LiteralPath (Join-Path $exportRoot "$kind-2.png")).Hash){throw "Identical animation frames: $kind"}
  $base=$palette[1]
  $catalog[$kind]=[ordered]@{label=$labels[$kind];file=$frames[0];frames=$frames;hue=[Math]::Round($base.GetHue());glow=@([int]$base.R,[int]$base.G,[int]$base.B)}
}
$catalog | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $artRoot 'creatures.json') -Encoding utf8
$preview=[System.Drawing.Bitmap]::new(768,584,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics=[System.Drawing.Graphics]::FromImage($preview)
$graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#edf6ff'))
$graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$graphics.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::Half
$font=[System.Drawing.Font]::new('Malgun Gothic',14)
$brush=[System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#0b1d3a'))
$i=0
foreach($kind in $labels.Keys){
  $left=($i%2)*384;$top=[Math]::Floor($i/2)*146
  $graphics.DrawString($labels[$kind],$font,$brush,[single]($left+10),[single]$top)
  $strip=[System.Drawing.Bitmap]::FromFile((Join-Path $artRoot "$kind-strip.png"))
  $graphics.DrawImage($strip,[System.Drawing.Rectangle]::new($left,$top+26,384,120),0,0,128,40,[System.Drawing.GraphicsUnit]::Pixel)
  $strip.Dispose();$i++
}
$graphics.Dispose();$font.Dispose();$brush.Dispose()
$preview.Save((Join-Path $artRoot 'preview.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$preview.Dispose()
Write-Output '7 species / 14 transparent 64x40 frames validated in artwork export folder.'
