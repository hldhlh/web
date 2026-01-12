$baseDir = "c:\Users\Aries\Desktop\i"
if (-not (Test-Path $baseDir)) { New-Item -ItemType Directory -Path $baseDir }

$header = @"
<?xml version="1.0" encoding="UTF-8"?>
<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="indigoGradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%" spreadMethod="pad">
      <stop offset="0%" style="stop-color:#2e317c;stop-opacity:1" />
      <stop offset="40%" style="stop-color:#2e317c;stop-opacity:0.65" />
      <stop offset="100%" style="stop-color:#2e317c;stop-opacity:0" />
    </radialGradient>
  </defs>
  <circle cx="50" cy="50" r="48" fill="url(#indigoGradient)" />
"@

$footer = "</svg>"

$designs = @{
    "i_221_OccamsRazor.svg" = '<path d="M20,80 L80,20" stroke="white" stroke-width="2" /><path d="M50,50 L90,90" stroke="white" stroke-width="0.5" stroke-dasharray="2,2" opacity="0.5" />'
    "i_222_HanlonsRazor.svg" = '<rect x="30" y="30" width="40" height="40" stroke="white" fill="none" rx="5" /><line x1="30" y1="30" x2="70" y2="70" stroke="white" /><line x1="70" y1="30" x2="30" y2="70" stroke="white" />'
    "i_223_ChekhovsGun.svg" = '<rect x="20" y="45" width="40" height="10" stroke="white" fill="none" /><rect x="25" y="55" width="10" height="15" stroke="white" fill="none" /><line x1="60" y1="50" x2="80" y2="50" stroke="white" />'
    "i_224_SchrodingersBox.svg" = '<rect x="30" y="30" width="40" height="40" stroke="white" fill="none" /><text x="50" y="55" font-family="Arial" font-size="20" fill="white" text-anchor="middle">?</text>'
    "i_225_PlatosCave.svg" = '<path d="M80,20 L80,80" stroke="white" /><circle cx="30" cy="50" r="5" fill="white" /><path d="M40,40 L40,60" stroke="white" /><path d="M85,30 L85,70" stroke="white" stroke-dasharray="2,2" opacity="0.5" />'
    "i_226_Sisyphus.svg" = '<line x1="10" y1="80" x2="90" y2="20" stroke="white" /><circle cx="50" cy="40" r="10" stroke="white" fill="none" /><path d="M45,40 L40,55" stroke="white" /><path d="M55,40 L60,55" stroke="white" />'
    "i_227_Vitruvian.svg" = '<circle cx="50" cy="50" r="40" stroke="white" fill="none" /><rect x="25" y="25" width="50" height="50" stroke="white" fill="none" />'
    "i_228_Modulor.svg" = '<line x1="50" y1="10" x2="50" y2="90" stroke="white" /><circle cx="50" cy="20" r="5" stroke="white" fill="none" /><line x1="30" y1="30" x2="70" y2="30" stroke="white" />'
    "i_229_GoldenAngle.svg" = '<circle cx="50" cy="50" r="40" stroke="white" fill="none" /><path d="M50,50 L50,10" stroke="white" /><path d="M50,50 L85,65" stroke="white" /><text x="60" y="40" fill="white" font-size="10">137.5°</text>'
    "i_230_SilverRatio.svg" = '<rect x="28" y="20" width="44" height="60" stroke="white" fill="none" />'
    "i_231_PlasticNumber.svg" = '<text x="50" y="60" font-family="Times New Roman" font-style="italic" font-size="40" fill="white" text-anchor="middle">ρ</text>'
    "i_232_Superellipse.svg" = '<path d="M50,10 C80,10 90,20 90,50 C90,80 80,90 50,90 C20,90 10,80 10,50 C10,20 20,10 50,10 Z" stroke="white" fill="none" />'
    "i_233_Squircle.svg" = '<rect x="20" y="20" width="60" height="60" rx="30" ry="30" stroke="white" fill="none" />'
    "i_234_ReuleauxTriangle.svg" = '<path d="M50,20 A60,60 0 0,1 80,72 A60,60 0 0,1 20,72 A60,60 0 0,1 50,20 Z" stroke="white" fill="none" />'
    "i_235_Gomboc.svg" = '<path d="M50,20 C70,20 80,50 80,80 C50,90 50,90 20,80 C20,50 30,20 50,20 Z" stroke="white" fill="none" />'
    "i_236_Oloid.svg" = '<ellipse cx="40" cy="50" rx="20" ry="30" stroke="white" fill="none" transform="rotate(45,40,50)" /><ellipse cx="60" cy="50" rx="20" ry="30" stroke="white" fill="none" transform="rotate(-45,60,50)" />'
    "i_237_Sphericon.svg" = '<path d="M50,10 L90,50 L50,90 L10,50 Z" stroke="white" fill="none" stroke-linejoin="round" /><path d="M10,50 Q50,50 90,50" stroke="white" fill="none" />'
    "i_238_Hexaflexagon.svg" = '<polygon points="50,20 75,35 75,65 50,80 25,65 25,35" stroke="white" fill="none" /><line x1="50" y1="50" x2="50" y2="20" stroke="white" /><line x1="50" y1="50" x2="75" y2="65" stroke="white" /><line x1="50" y1="50" x2="25" y2="65" stroke="white" />'
    "i_239_Tangram.svg" = '<polygon points="20,20 80,20 80,80 20,80" stroke="white" fill="none" /><line x1="20" y1="20" x2="80" y2="80" stroke="white" /><line x1="80" y1="20" x2="50" y2="50" stroke="white" />'
    "i_240_Origami.svg" = '<polygon points="50,20 80,80 20,80" stroke="white" fill="none" /><line x1="50" y1="20" x2="50" y2="80" stroke="white" stroke-dasharray="2,2" />'
}

foreach ($key in $designs.Keys) {
    # Ensure footer is attached correctly
    $content = $header + "`n" + $designs[$key] + "`n" + $footer
    $path = Join-Path $baseDir $key
    Set-Content -Path $path -Value $content -Encoding UTF8
    Write-Host "Created $key"
}
