param([ValidateSet('gold','betta','guppy','neon','angel','shrimp')][string[]]$Kinds = @('gold','betta','guppy','neon'))
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$assetRoot = Join-Path $projectRoot 'game/public/assets'
$artRoot = Join-Path $projectRoot 'artwork/style-update-2026-11-19'
$backupRoot = Join-Path $projectRoot 'artwork/history/2026-11-19-before-fish-style'
$generatedRoot = 'C:/Users/mio11/.codex/generated_images/01a1a40b-9ebe-7a30-8ae2-dc7b2dea9189'
$files = [ordered]@{
  gold = 'exec-731900ec-ebb6-4f3e-bf60-4214d2f250c3.png'
  betta = 'exec-3a205e75-325a-4106-a918-4c20c18f1cd8.png'
  guppy = 'exec-27cc96b5-0fbf-4cb6-a33f-706862f8fcea.png'
  neon = 'exec-235288a2-f300-411d-97c0-f579c032db97.png'
  angel = 'exec-bb52e62c-5c24-42c7-872b-eb602c938863.png'
  shrimp = 'exec-7d905864-d4e1-4af7-942f-c2229c35fbf8.png'
}
$references = foreach ($kind in $files.Keys) { if ($Kinds -notcontains $kind) { foreach ($suffix in @('','-2')) { Get-FileHash -LiteralPath (Join-Path $assetRoot ('fish-'+$kind+$suffix+'.png')) -Algorithm SHA256 } } }
foreach ($kind in $Kinds) {
  $sourcePath = Join-Path $generatedRoot $files[$kind]
  Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $artRoot ($kind + '-generated.png'))
  $source = [System.Drawing.Bitmap]::FromFile($sourcePath)
  $strip = [System.Drawing.Bitmap]::new(96,32,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($strip)
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $graphics.DrawImage($source,[System.Drawing.Rectangle]::new(0,0,96,32),0,0,$source.Width,$source.Height,[System.Drawing.GraphicsUnit]::Pixel)
  $graphics.Dispose(); $source.Dispose()
  for ($y=0;$y -lt 32;$y++) { for ($x=0;$x -lt 96;$x++) {
    $pixel = $strip.GetPixel($x,$y)
    if ($pixel.A -lt 128) { $strip.SetPixel($x,$y,[System.Drawing.Color]::Transparent) }
    else { $strip.SetPixel($x,$y,[System.Drawing.Color]::FromArgb(255,$pixel.R,$pixel.G,$pixel.B)) }
  }}
  if ($kind -eq 'shrimp') {
    $foot = 0
    for ($y=0;$y -lt 32;$y++) { for ($x=0;$x -lt 96;$x++) { if ($strip.GetPixel($x,$y).A -gt 0) { $foot = [Math]::Max($foot,$y) } } }
    $shifted = [System.Drawing.Bitmap]::new(96,32,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $shiftGraphics = [System.Drawing.Graphics]::FromImage($shifted)
    $shiftGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $shiftGraphics.DrawImageUnscaled($strip,0,(28-$foot))
    $shiftGraphics.Dispose(); $strip.Dispose(); $strip = $shifted
  }
  $strip.Save((Join-Path $artRoot ($kind + '-strip.png')),[System.Drawing.Imaging.ImageFormat]::Png)
  for ($frame=0;$frame -lt 2;$frame++) {
    $suffix = if ($frame -eq 0) { '' } else { '-2' }
    $name = 'fish-' + $kind + $suffix + '.png'
    $target = Join-Path $assetRoot $name
    $kindBackupRoot = if ($kind -in @('angel','shrimp')) { Join-Path $projectRoot 'artwork/history/2026-11-19-before-angel-shrimp' } else { $backupRoot }
    $backup = Join-Path $kindBackupRoot $name
    if (!(Test-Path -LiteralPath $backup)) { Copy-Item -LiteralPath $target -Destination $backup }
    $image = $strip.Clone([System.Drawing.Rectangle]::new($frame*48,0,48,32),[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $image.Save($target,[System.Drawing.Imaging.ImageFormat]::Png)
    $image.Dispose()
  }
  $strip.Dispose()
}
foreach ($reference in $references) {
  if ((Get-FileHash -LiteralPath $reference.Path -Algorithm SHA256).Hash -ne $reference.Hash) { throw 'Reference image changed' }
}
Write-Output (($Kinds.Count*2).ToString() + ' sprites saved at 48x32; other species unchanged.')
