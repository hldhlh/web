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
    "i_201_Syllogism.svg" = '<circle cx="35" cy="40" r="20" stroke="white" fill="none" opacity="0.6" /><circle cx="65" cy="40" r="20" stroke="white" fill="none" opacity="0.6" /><circle cx="50" cy="70" r="20" stroke="white" fill="none" opacity="0.6" /><path d="M50,15 L50,25" stroke="white" stroke-width="2" />'
    "i_202_ModusPonens.svg" = '<text x="30" y="40" font-family="Consolas" font-size="20" fill="white">P</text><path d="M45,35 L65,35" stroke="white" marker-end="url(#arrow)" /><text x="75" y="40" font-family="Consolas" font-size="20" fill="white">Q</text><text x="30" y="70" font-family="Consolas" font-size="20" fill="white">P</text><line x1="20" y1="80" x2="80" y2="80" stroke="white" /><text x="50" y="95" font-family="Consolas" font-size="20" fill="white">Q</text>'
    "i_203_TruthTable.svg" = '<rect x="20" y="20" width="60" height="60" stroke="white" fill="none" /><line x1="50" y1="20" x2="50" y2="80" stroke="white" /><line x1="20" y1="40" x2="80" y2="40" stroke="white" /><circle cx="35" cy="60" r="3" fill="white" /><circle cx="65" cy="60" r="3" stroke="white" fill="none" />'
    "i_204_Tautology.svg" = '<circle cx="50" cy="50" r="30" stroke="white" fill="none" /><path d="M35,50 L45,60 L65,40" stroke="white" fill="none" stroke-width="3" />'
    "i_205_Contradiction.svg" = '<circle cx="50" cy="50" r="30" stroke="white" fill="none" /><line x1="30" y1="30" x2="70" y2="70" stroke="white" stroke-width="2" /><line x1="70" y1="30" x2="30" y2="70" stroke="white" stroke-width="2" />'
    "i_206_Axiom.svg" = '<rect x="30" y="70" width="40" height="10" stroke="white" fill="white" /><line x1="50" y1="70" x2="50" y2="30" stroke="white" stroke-dasharray="2,2" /><circle cx="50" cy="20" r="4" stroke="white" fill="none" />'
    "i_207_Lemma.svg" = '<rect x="20" y="40" width="20" height="20" stroke="white" fill="none" opacity="0.6" /><path d="M45,50 L65,50" stroke="white" marker-end="url(#arrow)" /><rect x="70" y="30" width="25" height="40" stroke="white" fill="none" />'
    "i_208_Corollary.svg" = '<rect x="20" y="20" width="30" height="30" stroke="white" fill="none" /><path d="M55,50 L75,70" stroke="white" marker-end="url(#arrow)" /><rect x="70" y="70" width="15" height="15" stroke="white" fill="none" opacity="0.8" />'
    "i_209_QED.svg" = '<rect x="40" y="40" width="20" height="20" fill="white" />'
    "i_210_InfinityAleph.svg" = '<path d="M30,30 Q90,30 50,90 Q10,30 70,30" stroke="white" fill="none" stroke-width="2" />'
    "i_211_EmptySet.svg" = '<circle cx="50" cy="50" r="25" stroke="white" fill="none" /><line x1="70" y1="30" x2="30" y2="70" stroke="white" />'
    "i_212_PowerSet.svg" = '<text x="50" y="60" font-family="Times New Roman" font-size="50" font-style="italic" fill="white" text-anchor="middle">P</text><circle cx="65" cy="40" r="10" stroke="white" fill="none" stroke-width="0.5" />'
    "i_213_Bijection.svg" = '<ellipse cx="30" cy="50" rx="10" ry="30" stroke="white" fill="none" /><ellipse cx="70" cy="50" rx="10" ry="30" stroke="white" fill="none" /><line x1="30" y1="30" x2="70" y2="30" stroke="white" /><line x1="30" y1="50" x2="70" y2="50" stroke="white" /><line x1="30" y1="70" x2="70" y2="70" stroke="white" />'
    "i_214_Injection.svg" = '<ellipse cx="30" cy="50" rx="10" ry="30" stroke="white" fill="none" /><ellipse cx="70" cy="50" rx="10" ry="35" stroke="white" fill="none" /><line x1="30" y1="30" x2="70" y2="30" stroke="white" /><line x1="30" y1="60" x2="70" y2="70" stroke="white" />'
    "i_215_Surjection.svg" = '<ellipse cx="30" cy="50" rx="10" ry="35" stroke="white" fill="none" /><ellipse cx="70" cy="50" rx="10" ry="30" stroke="white" fill="none" /><line x1="30" y1="20" x2="70" y2="30" stroke="white" /><line x1="30" y1="40" x2="70" y2="30" stroke="white" /><line x1="30" y1="70" x2="70" y2="70" stroke="white" />'
    "i_216_Cardinality.svg" = '<line x1="30" y1="20" x2="30" y2="80" stroke="white" /><line x1="70" y1="20" x2="70" y2="80" stroke="white" /><circle cx="50" cy="50" r="10" stroke="white" fill="none" stroke-width="2" />'
    "i_217_Ordinal.svg" = '<text x="20" y="60" font-family="Consolas" font-size="20" fill="white">1</text><path d="M35,50 L45,50" stroke="white" marker-end="url(#arrow)" /><text x="55" y="60" font-family="Consolas" font-size="20" fill="white">2</text><path d="M70,50 L80,50" stroke="white" marker-end="url(#arrow)" /><text x="90" y="60" font-family="Consolas" font-size="10" fill="white">...</text>'
    "i_218_ZFC.svg" = '<text x="50" y="60" font-family="sans-serif" font-weight="bold" font-size="30" fill="white" text-anchor="middle">ZFC</text>'
    "i_219_CategoryTheory.svg" = '<circle cx="20" cy="80" r="5" fill="white" /><circle cx="50" cy="20" r="5" fill="white" /><circle cx="80" cy="80" r="5" fill="white" /><path d="M25,75 L45,25" stroke="white" marker-end="url(#arrow)" /><path d="M55,25 L75,75" stroke="white" marker-end="url(#arrow)" /><path d="M25,80 L75,80" stroke="white" marker-end="url(#arrow)" />'
    "i_220_Functor.svg" = '<rect x="15" y="40" width="20" height="20" stroke="white" fill="none" /><rect x="65" y="40" width="20" height="20" stroke="white" fill="none" /><path d="M40,50 L60,50" stroke="white" stroke-width="2" marker-end="url(#arrow)" /><text x="50" y="40" font-family="serif" font-style="italic" font-size="15" fill="white" text-anchor="middle">F</text>'
}

foreach ($key in $designs.Keys) {
    # Ensure footer is attached correctly
    $content = $header + "`n" + $designs[$key] + "`n" + $footer
    $path = Join-Path $baseDir $key
    Set-Content -Path $path -Value $content -Encoding UTF8
    Write-Host "Created $key"
}
