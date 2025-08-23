$ErrorActionPreference = "Stop"

$root = (Get-Location).Path
$excludePattern = '\\(node_modules|dist|build|coverage|\.next|\.turbo|\.git|out)\\'

$files = Get-ChildItem -Recurse -File -Include *.ts,*.tsx |
  Where-Object { $_.FullName -notmatch $excludePattern }

$results = New-Object System.Collections.Generic.List[object]

foreach ($f in $files) {
  $text = Get-Content -Raw -Path $f.FullName

  # Find class names that end with Agent
  $agentClassMatches = [regex]::Matches($text, 'class\s+([A-Za-z0-9_]+Agent)\b')

  $names = New-Object System.Collections.Generic.HashSet[string]
  foreach ($m in $agentClassMatches) { $null = $names.Add($m.Groups[1].Value) }

  # Heuristics for well-known names that may not use "class <Name>Agent"
  if ($text -match '\bPromoter\b')       { $null = $names.Add('Promoter') }
  if ($text -match '\bGradingAgent\b')   { $null = $names.Add('GradingAgent') }
  if ($text -match '\bRecapAgent\b')     { $null = $names.Add('RecapAgent') }

  if ($names.Count -gt 0) {
    foreach ($n in $names) {
      $kinds = @()
      if ($f.FullName -match '\\(worker|workers)\\')      { $kinds += 'worker' }
      if ($f.FullName -match '\\(workflow|workflows)\\')  { $kinds += 'temporal' }
      if ($f.FullName -match '\\(adapter|adapters)\\')    { $kinds += 'adapter' }
      if ($n -eq 'Promoter' -and -not ($kinds -contains 'adapter')) { $kinds += 'adapter' }
      if ($kinds.Count -eq 0) { $kinds = @('unknown') }

      $relPath = $f.FullName.Replace($root, '.')
      $results.Add([pscustomobject]@{
        name       = $n
        path       = $relPath
        kind       = ($kinds -join '|')
        importedBy = @()  # optional: fill later with a dependency scan
      })
    }
  }
}

# De-dup results by name+path
$results =
  $results |
  Sort-Object name, path -Unique

# Write JSON
$dest = 'out\dev\agent-inventory.json'
$results | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $dest
Write-Host "Wrote $dest with $($results.Count) entries."
