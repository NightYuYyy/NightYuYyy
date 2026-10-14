$ErrorActionPreference = "Continue"
$owner = "NightYuYyy"
$planPath = Join-Path $PSScriptRoot "_repo_plan.json"
$plan = Get-Content -Path $planPath -Raw -Encoding UTF8 | ConvertFrom-Json
$results = New-Object System.Collections.Generic.List[object]

foreach ($item in $plan) {
  $repo = $item.name
  Write-Host "=== $repo ==="
  $topicOk = $false
  $descOk = $null
  $archOk = $false

  $tmp = [System.IO.Path]::GetTempFileName()
  $payload = @{ names = @($item.topics) } | ConvertTo-Json -Compress
  [System.IO.File]::WriteAllText($tmp, $payload)
  $null = & gh api -X PUT "repos/$owner/$repo/topics" -H "Accept: application/vnd.github+json" --input $tmp 2>&1
  $topicOk = ($LASTEXITCODE -eq 0)
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue

  if ($null -ne $item.desc -and "$($item.desc)" -ne "") {
    $null = & gh api -X PATCH "repos/$owner/$repo" -f "description=$($item.desc)" 2>&1
    $descOk = ($LASTEXITCODE -eq 0)
  }

  if ($item.archive -eq $true) {
    $null = & gh api -X PATCH "repos/$owner/$repo" -F archived=true 2>&1
    $archOk = ($LASTEXITCODE -eq 0)
  }

  $results.Add([PSCustomObject]@{
    repo = $repo
    topics_ok = $topicOk
    desc_ok = $descOk
    archived = $archOk
  }) | Out-Null
  Write-Host ("  topics={0} desc={1} archive={2}" -f $topicOk, $descOk, $archOk)
}

$out = Join-Path $PSScriptRoot "_organize_repos_result.json"
$results | ConvertTo-Json | Set-Content -Path $out -Encoding UTF8
$failT = @($results | Where-Object { -not $_.topics_ok }).Count
$failD = @($results | Where-Object { $_.desc_ok -eq $false }).Count
$archN = @($results | Where-Object { $_.archived -eq $true }).Count
Write-Host "DONE total=$($results.Count) failTopics=$failT failDesc=$failD archivedOk=$archN"
