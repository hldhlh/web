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
    "i_181_BlackBody.svg" = '<circle cx="50" cy="50" r="30" stroke="white" fill="none" /><path d="M50,50 L80,20" stroke="white" stroke-dasharray="2,2" marker-end="url(#arrow)" /><line x1="50" y1="50" x2="60" y2="40" stroke="white" /><path d="M40,50 Q45,35 55,40 T70,30" stroke="white" fill="none" opacity="0.6" transform="translate(-10,10)" />'
    "i_182_Photoelectric.svg" = '<rect x="30" y="70" width="40" height="10" stroke="white" fill="none" /><line x1="30" y1="20" x2="40" y2="70" stroke="white" stroke-dasharray="3,2" marker-end="url(#arrow)" /><line x1="50" y1="20" x2="60" y2="70" stroke="white" stroke-dasharray="3,2" marker-end="url(#arrow)" /><circle cx="45" cy="55" r="3" fill="white" /><path d="M45,55 L80,30" stroke="white" marker-end="url(#arrow)" />'
    "i_183_ComptonScattering.svg" = '<line x1="10" y1="50" x2="45" y2="50" stroke="white" stroke-dasharray="3,2" /><circle cx="50" cy="50" r="5" stroke="white" fill="none" /><line x1="55" y1="50" x2="85" y2="30" stroke="white" marker-end="url(#arrow)" /><line x1="55" y1="50" x2="80" y2="70" stroke="white" stroke-dasharray="3,2" />'
    "i_184_Fusion.svg" = '<circle cx="35" cy="50" r="8" stroke="white" fill="none" /><circle cx="45" cy="70" r="8" stroke="white" fill="none" /><path d="M25,50 Q40,50 65,50" stroke="white" fill="none" marker-end="url(#arrow)" /><circle cx="75" cy="50" r="12" fill="white" opacity="0.8" />'
    "i_185_Fission.svg" = '<circle cx="30" cy="50" r="15" fill="white" opacity="0.8" /><path d="M45,50 Q60,30 80,20" stroke="white" fill="none" marker-end="url(#arrow)" /><path d="M45,50 Q60,70 80,80" stroke="white" fill="none" marker-end="url(#arrow)" />'
    "i_186_HalfLife.svg" = '<path d="M10,20 Q30,80 90,90" stroke="white" fill="none" /><line x1="10" y1="90" x2="90" y2="90" stroke="white" /><line x1="10" y1="20" x2="10" y2="90" stroke="white" /><line x1="10" y1="55" x2="45" y2="55" stroke="white" stroke-dasharray="2,2" />'
    "i_187_Isotope.svg" = '<circle cx="50" cy="50" r="20" stroke="white" fill="none" /><circle cx="50" cy="50" r="25" stroke="white" fill="none" stroke-dasharray="4,4" /><circle cx="50" cy="50" r="10" fill="white" />'
    "i_188_Crystallography.svg" = '<circle cx="30" cy="30" r="5" stroke="white" fill="none" /><circle cx="70" cy="30" r="5" stroke="white" fill="none" /><circle cx="30" cy="70" r="5" stroke="white" fill="none" /><circle cx="70" cy="70" r="5" stroke="white" fill="none" /><line x1="30" y1="35" x2="30" y2="65" stroke="white" /><line x1="70" y1="35" x2="70" y2="65" stroke="white" /><line x1="35" y1="30" x2="65" y2="30" stroke="white" /><line x1="35" y1="70" x2="65" y2="70" stroke="white" />'
    "i_189_BravaisLattice.svg" = '<circle cx="20" cy="20" r="2" fill="white" /><circle cx="50" cy="20" r="2" fill="white" /><circle cx="80" cy="20" r="2" fill="white" /><circle cx="35" cy="50" r="2" fill="white" /><circle cx="65" cy="50" r="2" fill="white" /><circle cx="20" cy="80" r="2" fill="white" /><circle cx="50" cy="80" r="2" fill="white" /><circle cx="80" cy="80" r="2" fill="white" />'
    "i_190_MillerIndices.svg" = '<line x1="50" y1="20" x2="50" y2="80" stroke="white" /><line x1="20" y1="50" x2="80" y2="50" stroke="white" /><line x1="30" y1="70" x2="70" y2="30" stroke="white" stroke-width="2" /><text x="75" y="30" font-family="Consolas" font-size="10" fill="white">(111)</text>'
    "i_191_PhaseDiagram.svg" = '<line x1="10" y1="90" x2="90" y2="90" stroke="white" /><line x1="10" y1="90" x2="10" y2="10" stroke="white" /><path d="M10,90 Q40,70 90,20" stroke="white" fill="none" /><path d="M40,70 Q50,40 50,10" stroke="white" fill="none" />'
    "i_192_TriplePoint.svg" = '<path d="M50,50 L20,80" stroke="white" fill="none" /><path d="M50,50 L80,80" stroke="white" fill="none" /><path d="M50,50 L50,10" stroke="white" fill="none" /><circle cx="50" cy="50" r="3" fill="white" />'
    "i_193_CarnotCycle.svg" = '<path d="M30,30 Q60,30 80,50" stroke="white" fill="none" /><path d="M80,50 Q80,80 50,80" stroke="white" fill="none" /><path d="M50,80 Q20,80 30,30" stroke="white" fill="none" />'
    "i_194_Adiabatic.svg" = '<path d="M20,20 Q40,80 90,90" stroke="white" fill="none" stroke-width="1.5" /><path d="M30,10 Q60,60 90,70" stroke="white" fill="none" opacity="0.5" />'
    "i_195_Bernoulli.svg" = '<path d="M10,30 L40,40 L60,40 L90,30" stroke="white" fill="none" /><path d="M10,70 L40,60 L60,60 L90,70" stroke="white" fill="none" /><line x1="50" y1="45" x2="60" y2="45" stroke="white" marker-end="url(#arrow)" />'
    "i_196_ReynoldsNum.svg" = '<path d="M10,30 Q30,30 50,50 T90,70" stroke="white" fill="none" /><path d="M10,50 Q40,40 60,60 T90,50" stroke="white" fill="none" stroke-dasharray="2,2" opacity="0.7" />'
    "i_197_MachCone.svg" = '<circle cx="20" cy="50" r="5" fill="white" /><line x1="20" y1="50" x2="80" y2="20" stroke="white" opacity="0.5" /><line x1="20" y1="50" x2="80" y2="80" stroke="white" opacity="0.5" /><line x1="80" y1="20" x2="80" y2="80" stroke="white" opacity="0.3" stroke-dasharray="2,2" />'
    "i_198_Coriolis.svg" = '<circle cx="50" cy="50" r="40" stroke="white" fill="none" /><path d="M50,10 Q60,30 50,50" stroke="white" fill="none" marker-end="url(#arrow)" />'
    "i_199_FoucaultPendulum.svg" = '<line x1="50" y1="10" x2="50" y2="70" stroke="white" /><circle cx="50" cy="75" r="5" stroke="white" fill="none" /><ellipse cx="50" cy="85" rx="20" ry="5" stroke="white" fill="none" opacity="0.3" />'
    "i_200_Gyroscope.svg" = '<ellipse cx="50" cy="50" rx="30" ry="10" stroke="white" fill="none" /><line x1="50" y1="20" x2="50" y2="80" stroke="white" /><circle cx="50" cy="50" r="4" fill="white" />'
}

foreach ($key in $designs.Keys) {
    # Ensure footer is attached correctly
    $content = $header + "`n" + $designs[$key] + "`n" + $footer
    $path = Join-Path $baseDir $key
    Set-Content -Path $path -Value $content -Encoding UTF8
    Write-Host "Created $key"
}
