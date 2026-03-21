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
    "i_161_Stack.svg" = '<rect x="35" y="70" width="30" height="10" stroke="white" fill="none" /><rect x="35" y="55" width="30" height="10" stroke="white" fill="none" /><rect x="35" y="40" width="30" height="10" stroke="white" fill="none" /><path d="M50,15 L50,35" stroke="white" marker-end="url(#arrow)" /><polyline points="45,30 50,35 55,30" stroke="white" fill="none" />'
    "i_162_Queue.svg" = '<rect x="10" y="40" width="20" height="20" stroke="white" fill="none" /><rect x="40" y="40" width="20" height="20" stroke="white" fill="none" /><rect x="70" y="40" width="20" height="20" stroke="white" fill="none" opacity="0.5" stroke-dasharray="2,2" /><line x1="30" y1="50" x2="40" y2="50" stroke="white" />'
    "i_163_Heap.svg" = '<circle cx="50" cy="20" r="8" stroke="white" fill="none" /><circle cx="30" cy="50" r="8" stroke="white" fill="none" /><circle cx="70" cy="50" r="8" stroke="white" fill="none" /><circle cx="20" cy="80" r="8" stroke="white" fill="none" /><circle cx="40" cy="80" r="8" stroke="white" fill="none" /><line x1="50" y1="28" x2="30" y2="42" stroke="white" /><line x1="50" y1="28" x2="70" y2="42" stroke="white" /><line x1="30" y1="58" x2="20" y2="72" stroke="white" /><line x1="30" y1="58" x2="40" y2="72" stroke="white" />'
    "i_164_RedBlackTree.svg" = '<circle cx="50" cy="20" r="6" stroke="white" fill="white" fill-opacity="0.2" /><circle cx="30" cy="50" r="6" stroke="white" fill="white" /><circle cx="70" cy="50" r="6" stroke="white" fill="white" fill-opacity="0.2" /><line x1="50" y1="26" x2="30" y2="44" stroke="white" /><line x1="50" y1="26" x2="70" y2="44" stroke="white" />'
    "i_165_Trie.svg" = '<circle cx="50" cy="20" r="5" stroke="white" fill="none" /><line x1="50" y1="25" x2="30" y2="50" stroke="white" opacity="0.5" /><line x1="50" y1="25" x2="50" y2="50" stroke="white" opacity="0.5" /><line x1="50" y1="25" x2="70" y2="50" stroke="white" opacity="0.5" />'
    "i_166_BloomFilter.svg" = '<rect x="10" y="40" width="80" height="20" stroke="white" fill="none" /><line x1="20" y1="40" x2="20" y2="60" stroke="white" /><line x1="50" y1="40" x2="50" y2="60" stroke="white" /><line x1="70" y1="40" x2="70" y2="60" stroke="white" /><circle cx="50" cy="50" r="3" fill="white" />'
    "i_167_MerkleTree.svg" = '<rect x="10" y="70" width="15" height="10" stroke="white" fill="none" /><rect x="30" y="70" width="15" height="10" stroke="white" fill="none" /><rect x="55" y="70" width="15" height="10" stroke="white" fill="none" /><rect x="75" y="70" width="15" height="10" stroke="white" fill="none" /><rect x="20" y="45" width="15" height="10" stroke="white" fill="none" opacity="0.8" /><rect x="65" y="45" width="15" height="10" stroke="white" fill="none" opacity="0.8" /><rect x="42" y="20" width="15" height="10" stroke="white" fill="none" />'
    "i_168_Blockchain.svg" = '<rect x="10" y="40" width="20" height="20" stroke="white" fill="none" /><rect x="40" y="40" width="20" height="20" stroke="white" fill="none" /><rect x="70" y="40" width="20" height="20" stroke="white" fill="none" /><line x1="30" y1="50" x2="40" y2="50" stroke="white" stroke-dasharray="2,1" /><line x1="60" y1="50" x2="70" y2="50" stroke="white" stroke-dasharray="2,1" />'
    "i_169_Encryption.svg" = '<rect x="35" y="45" width="30" height="25" rx="3" stroke="white" fill="none" /><path d="M40,45 L40,35 Q50,20 60,35 L60,45" stroke="white" fill="none" /><circle cx="50" cy="57" r="3" fill="white" /><path d="M50,60 L50,65" stroke="white" />'
    "i_170_PublicKey.svg" = '<path d="M30,50 L70,50 L80,40 L70,30 L30,30 L20,40 Z" stroke="white" fill="none" opacity="0.5" /><path d="M35,60 L65,60 L75,70 L75,50 L65,60" stroke="white" fill="none" />'
    "i_171_FiniteAutomaton.svg" = '<circle cx="30" cy="50" r="15" stroke="white" fill="none" /><circle cx="70" cy="50" r="15" stroke="white" fill="none" stroke-width="2" /><path d="M45,50 L55,50" stroke="white" marker-end="url(#arrow)" /><polyline points="50,45 55,50 50,55" stroke="white" fill="none" />'
    "i_172_RegEx.svg" = '<text x="50" y="60" font-family="Consolas, monospace" font-size="30" fill="white" text-anchor="middle">/.*+/</text>'
    "i_173_BigO.svg" = '<text x="30" y="65" font-family="Times New Roman, serif" font-style="italic" font-size="50" fill="white">O</text><text x="65" y="65" font-family="Times New Roman, serif" font-size="30" fill="white">(n)</text>'
    "i_174_Recursion.svg" = '<rect x="10" y="10" width="80" height="80" stroke="white" fill="none" opacity="0.3" /><rect x="20" y="20" width="60" height="60" stroke="white" fill="none" opacity="0.5" /><rect x="30" y="30" width="40" height="40" stroke="white" fill="none" opacity="0.7" /><rect x="40" y="40" width="20" height="20" stroke="white" fill="none" />'
    "i_175_Deadlock.svg" = '<circle cx="30" cy="50" r="10" stroke="white" fill="none" /><circle cx="70" cy="50" r="10" stroke="white" fill="none" /><path d="M30,40 Q50,20 70,40" stroke="white" fill="none" marker-end="url(#arrow)" /><path d="M70,60 Q50,80 30,60" stroke="white" fill="none" marker-end="url(#arrow)" /><polyline points="65,35 70,40 65,45" stroke="white" fill="none" /><polyline points="35,65 30,60 35,55" stroke="white" fill="none" />'
    "i_176_Semaphore.svg" = '<rect x="40" y="20" width="20" height="60" stroke="white" fill="none" /><circle cx="50" cy="35" r="5" fill="white" opacity="0.3" /><circle cx="50" cy="50" r="5" fill="white" opacity="0.3" /><circle cx="50" cy="65" r="5" fill="white" />'
    "i_177_Pipeline.svg" = '<rect x="10" y="20" width="20" height="10" stroke="white" fill="none" opacity="0.4" /><rect x="35" y="35" width="20" height="10" stroke="white" fill="none" opacity="0.6" /><rect x="60" y="50" width="20" height="10" stroke="white" fill="none" opacity="0.8" /><rect x="85" y="65" width="20" height="10" stroke="white" fill="none" />'
    "i_178_LoadBalancer.svg" = '<circle cx="50" cy="25" r="10" stroke="white" fill="none" /><line x1="50" y1="35" x2="30" y2="60" stroke="white" /><line x1="50" y1="35" x2="50" y2="60" stroke="white" /><line x1="50" y1="35" x2="70" y2="60" stroke="white" /><rect x="25" y="60" width="10" height="10" stroke="white" fill="none" /><rect x="45" y="60" width="10" height="10" stroke="white" fill="none" /><rect x="65" y="60" width="10" height="10" stroke="white" fill="none" />'
    "i_179_DistributedSystem.svg" = '<circle cx="50" cy="20" r="5" stroke="white" fill="none" /><circle cx="20" cy="70" r="5" stroke="white" fill="none" /><circle cx="80" cy="70" r="5" stroke="white" fill="none" /><path d="M50,25 L25,65 L75,65 Z" stroke="white" fill="none" opacity="0.5" />'
    "i_180_NeuralActivation.svg" = '<circle cx="50" cy="50" r="20" stroke="white" fill="none" /><path d="M30,50 Q40,50 45,35" stroke="white" fill="none" /><path d="M70,50 Q60,50 55,65" stroke="white" fill="none" /><circle cx="50" cy="50" r="5" fill="white" opacity="0.8" />'
}

foreach ($key in $designs.Keys) {
    # Ensure footer is attached correctly
    $content = $header + "`n" + $designs[$key] + "`n" + $footer
    $path = Join-Path $baseDir $key
    Set-Content -Path $path -Value $content -Encoding UTF8
    Write-Host "Created $key"
}
