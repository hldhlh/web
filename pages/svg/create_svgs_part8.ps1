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
    "i_141_TangentBundle.svg" = '<circle cx="50" cy="50" r="20" stroke="white" fill="none" /><line x1="30" y1="50" x2="70" y2="50" stroke="white" stroke-width="0.5" /><line x1="36" y1="36" x2="64" y2="64" stroke="white" stroke-width="0.5" /><line x1="50" y1="30" x2="50" y2="70" stroke="white" stroke-width="0.5" /><line x1="10" y1="10" x2="30" y2="30" stroke="white" /><line x1="10" y1="90" x2="30" y2="70" stroke="white" /><line x1="90" y1="10" x2="70" y2="30" stroke="white" /><line x1="90" y1="90" x2="70" y2="70" stroke="white" />'
    "i_142_Curvature.svg" = '<path d="M10,80 Q30,20 50,50 T90,20" stroke="white" fill="none" stroke-width="1.5" /><circle cx="50" cy="50" r="15" stroke="white" fill="none" stroke-dasharray="2,2" opacity="0.6" />'
    "i_143_Geodesic.svg" = '<ellipse cx="50" cy="50" rx="40" ry="20" stroke="white" fill="none" opacity="0.5" /><path d="M10,50 Q50,90 90,50" stroke="white" fill="none" /><path d="M10,50 Q50,10 90,50" stroke="white" fill="none" stroke-dasharray="3,3" />'
    "i_144_Holonomy.svg" = '<circle cx="50" cy="50" r="30" stroke="white" fill="none" opacity="0.3"/><path d="M50,20 A30,30 0 0,1 80,50" stroke="white" fill="none" marker-end="url(#arrow)" /><path d="M80,50 A30,30 0 0,1 50,80" stroke="white" fill="none" /><path d="M50,80 A30,30 0 0,1 20,50" stroke="white" fill="none" stroke-dasharray="4,2" />'
    "i_145_Torsion.svg" = '<path d="M30,90 C30,70 70,70 70,50 C70,30 30,30 30,10" stroke="white" fill="none" stroke-width="2" />'
    "i_146_Simplex.svg" = '<polygon points="50,15 15,75 85,75" stroke="white" fill="none" /><line x1="50" y1="15" x2="50" y2="45" stroke="white" /><line x1="15" y1="75" x2="50" y2="45" stroke="white" /><line x1="85" y1="75" x2="50" y2="45" stroke="white" />'
    "i_147_ComplexPlane.svg" = '<line x1="10" y1="50" x2="90" y2="50" stroke="white" stroke-width="1" /><line x1="50" y1="90" x2="50" y2="10" stroke="white" stroke-width="1" /><circle cx="70" cy="30" r="2" fill="white" /><line x1="50" y1="50" x2="70" y2="30" stroke="white" stroke-dasharray="2,2" />'
    "i_148_Residue.svg" = '<circle cx="50" cy="50" r="30" stroke="white" fill="none" /><circle cx="50" cy="50" r="2" fill="white" /><path d="M50,50 L71,71" stroke="white" stroke-dasharray="2,2" />'
    "i_149_ContourIntegral.svg" = '<path d="M30,30 C10,50 30,90 50,90 C80,90 90,50 70,30 C60,20 40,20 30,30 Z" stroke="white" fill="none" /><path d="M45,25 L55,25 L50,35 Z" fill="white" />'
    "i_150_FieldLines.svg" = '<path d="M10,30 Q50,0 90,30" stroke="white" fill="none" opacity="0.5" /><path d="M10,50 Q50,20 90,50" stroke="white" fill="none" opacity="0.7" /><path d="M10,70 Q50,40 90,70" stroke="white" fill="none" opacity="0.9" />'
    "i_151_Isomorphism.svg" = '<rect x="20" y="30" width="20" height="40" stroke="white" fill="none" /><circle cx="80" cy="50" r="15" stroke="white" fill="none" /><line x1="45" y1="50" x2="60" y2="50" stroke="white" marker-end="url(#arrow)" /><path d="M60,50 L55,45 M60,50 L55,55" stroke="white" />'
    "i_152_Kernel.svg" = '<ellipse cx="30" cy="50" rx="15" ry="30" stroke="white" fill="none" /><ellipse cx="80" cy="50" rx="10" ry="20" stroke="white" fill="none" /><line x1="30" y1="50" x2="80" y2="50" stroke="white" stroke-dasharray="3,3" /><circle cx="80" cy="50" r="2" fill="white" />'
    "i_153_Eigenvector.svg" = '<line x1="20" y1="80" x2="80" y2="20" stroke="white" stroke-width="2" /><line x1="50" y1="50" x2="70" y2="40" stroke="white" opacity="0.5" stroke-dasharray="2,2" /><line x1="50" y1="50" x2="65" y2="35" stroke="white" stroke-width="2" />'
    "i_154_MarkovChain.svg" = '<circle cx="30" cy="50" r="15" stroke="white" fill="none" /><circle cx="70" cy="50" r="15" stroke="white" fill="none" /><path d="M30,35 Q50,10 70,35" stroke="white" fill="none" marker-end="url(#arrow)" /><path d="M40,30 L45,25 M40,30 L35,25" stroke="white" transform="translate(30,0)" /><path d="M70,65 Q50,90 30,65" stroke="white" fill="none" />'
    "i_155_StochasticProcess.svg" = '<polyline points="10,50 20,40 30,60 40,30 50,55 60,45 70,70 80,20 90,50" stroke="white" fill="none" stroke-linejoin="round" />'
    "i_156_BrownianBridge.svg" = '<path d="M10,50 Q30,20 50,50 T90,50" stroke="white" fill="none" /><line x1="10" y1="50" x2="90" y2="50" stroke="white" stroke-dasharray="2,2" opacity="0.4" />'
    "i_157_Martingale.svg" = '<line x1="10" y1="80" x2="90" y2="20" stroke="white" opacity="0.3" /><polyline points="10,80 30,75 50,60 70,65 90,50" stroke="white" fill="none" />'
    "i_158_GameTheory.svg" = '<rect x="30" y="30" width="40" height="40" stroke="white" fill="none" /><line x1="50" y1="30" x2="50" y2="70" stroke="white" /><line x1="30" y1="50" x2="70" y2="50" stroke="white" />'
    "i_159_NashEquilibrium.svg" = '<circle cx="50" cy="30" r="5" stroke="white" fill="none" /><circle cx="30" cy="70" r="5" stroke="white" fill="none" /><circle cx="70" cy="70" r="5" stroke="white" fill="none" /><path d="M50,35 L30,65 L70,65 Z" stroke="white" fill="none" opacity="0.3" /><circle cx="50" cy="45" r="2" fill="white" />'
    "i_160_ParetoFront.svg" = '<line x1="10" y1="10" x2="10" y2="90" stroke="white" /><line x1="10" y1="90" x2="90" y2="90" stroke="white" /><path d="M20,20 Q60,80 80,80" stroke="white" fill="none" stroke-width="2" />'
}

foreach ($key in $designs.Keys) {
    # Ensure footer is attached correctly
    $content = $header + "`n" + $designs[$key] + "`n" + $footer
    $path = Join-Path $baseDir $key
    Set-Content -Path $path -Value $content -Encoding UTF8
    Write-Host "Created $key"
}
