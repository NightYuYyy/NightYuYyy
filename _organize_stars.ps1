# Create 9 private star lists and categorize starred repos
$ErrorActionPreference = "Continue"
$outDir = $PSScriptRoot

# 1) Fetch all starred repos with node_id via GraphQL pagination
$stars = New-Object System.Collections.Generic.List[object]
$cursor = $null
$page = 0
do {
  $page++
  if ($cursor) {
    $q = @"
query {
  viewer {
    starredRepositories(first: 100, after: "$cursor", orderBy: {field: STARRED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes { id nameWithOwner description url }
    }
  }
}
"@
  } else {
    $q = @"
query {
  viewer {
    starredRepositories(first: 100, orderBy: {field: STARRED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes { id nameWithOwner description url }
    }
  }
}
"@
  }
  $tmpQ = Join-Path $env:TEMP "gql-stars-$page.graphql"
  # use gh api graphql with -f query=
  $jsonPath = Join-Path $env:TEMP "gql-stars-$page.json"
  $q | Set-Content -Path $tmpQ -Encoding UTF8
  $raw = & gh api graphql -f "query=$q" 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "GraphQL star page $page failed: $raw"
    break
  }
  $data = $raw | ConvertFrom-Json
  $conn = $data.data.viewer.starredRepositories
  foreach ($n in $conn.nodes) {
    $stars.Add([PSCustomObject]@{
      id = $n.id
      full_name = $n.nameWithOwner
      description = $n.description
      url = $n.url
    }) | Out-Null
  }
  $hasNext = $conn.pageInfo.hasNextPage
  $cursor = $conn.pageInfo.endCursor
  Write-Host "Fetched page $page stars total=$($stars.Count) hasNext=$hasNext"
} while ($hasNext)

Write-Host "Total stars: $($stars.Count)"
$stars | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $outDir "_stars_raw.json") -Encoding UTF8

# 2) Create lists
$listDefs = @(
  @{ name = "AI Agent / Skills"; desc = "Agent frameworks, skills, orchestration" },
  @{ name = "Claude Codex OpenCode"; desc = "Claude Code / Codex / OpenCode ecosystem" },
  @{ name = "AI Proxy Gateway"; desc = "API proxies, relays, multi-provider gateways" },
  @{ name = "Prompt Design UI Skill"; desc = "Prompts, design systems, PPT/UI skills" },
  @{ name = "Learn Interview Frontend"; desc = "Interview, algorithms, Vue/frontend learning" },
  @{ name = "Ops VPS Network"; desc = "VPS, reinstall, proxy clients, networking" },
  @{ name = "Productivity Clients"; desc = "WeChat export, NAS, userscripts, utilities" },
  @{ name = "Awesome References"; desc = "Awesome lists, cheatsheets, resource guides" },
  @{ name = "Read Later"; desc = "Uncategorized / to review later" }
)

# Check existing lists first
$existQ = @"
query {
  viewer {
    lists(first: 32) {
      nodes { id name }
    }
  }
}
"@
$existRaw = & gh api graphql -f "query=$existQ" 2>&1
$existData = $existRaw | ConvertFrom-Json
$existing = @{}
if ($existData.data.viewer.lists.nodes) {
  foreach ($l in $existData.data.viewer.lists.nodes) {
    $existing[$l.name] = $l.id
  }
}

$listIds = @{}
foreach ($def in $listDefs) {
  if ($existing.ContainsKey($def.name)) {
    $listIds[$def.name] = $existing[$def.name]
    Write-Host "List exists: $($def.name) -> $($listIds[$def.name])"
    continue
  }
  $name = $def.name
  $desc = $def.desc
  $mut = @"
mutation {
  createUserList(input: {name: "$name", description: "$desc", isPrivate: true}) {
    list { id name }
  }
}
"@
  $mraw = & gh api graphql -f "query=$mut" 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Create list failed $name : $mraw"
    continue
  }
  $mdata = $mraw | ConvertFrom-Json
  if ($mdata.errors) {
    Write-Host "Create list errors $name : $($mdata.errors | ConvertTo-Json -Compress)"
    continue
  }
  $lid = $mdata.data.createUserList.list.id
  $listIds[$name] = $lid
  Write-Host "Created list: $name -> $lid"
}

$listIds | ConvertTo-Json | Set-Content (Join-Path $outDir "_list_ids.json") -Encoding UTF8

# 3) Classify
function Get-ListName([string]$full, [string]$desc) {
  $t = ($full + " " + $desc).ToLowerInvariant()

  # Order matters: more specific first
  if ($t -match 'proxy|relay|gateway|anyrouter|newapi|oneapi|aiclient|claude-code-hub|amp-manager') {
    # hub can go to claude OR proxy - prefer proxy for hub/relay
    if ($t -match 'relay|proxy|gateway|anyrouter|aiclient|newapi|oneapi') {
      return "AI Proxy Gateway"
    }
  }
  if ($t -match 'claude-code-hub|claude-relay|cc-switch|cc-connect|codex-threads|opencode|claude code|claude-code|oh-my-codex|oh-my-openagent|oh-my-claudecode|spec-workflow-mcp|shnote|cch') {
    return "Claude Codex OpenCode"
  }
  if ($t -match 'superpowers|ponytail|hermes-agent|agent|skill|multi-agent|oh-my|ainovel|persona-skill|wshobson/agents|wshobson/commands') {
    return "AI Agent / Skills"
  }
  if ($t -match 'design-md|ui-ux|prompt|ppt|gpt-image|persona|shadcn|design system|gordenppt') {
    return "Prompt Design UI Skill"
  }
  if ($t -match 'interview|leetcode|algorithm|frontend|front-end|vue|roadmap|33-js|fucking-algorithm|cs-base|thealgorithms|fe-interview|javascript-algorithms|daily-question|learning-vue|element-admin') {
    return "Learn Interview Frontend"
  }
  if ($t -match 'reinstall|ipquality|hardwarequality|clash|quantumult|shadowrocket|nginx|lazydocker|dev-sidecar|vps|ddgksf|flclash|thanks-mirror') {
    return "Ops VPS Network"
  }
  if ($t -match 'wechat|weflow|wechatmsg|moviepilot|userscript|gm_script|pearcleaner|xianyu|trilium|tampermonkey|greasemonkey|fileheader|koro1') {
    return "Productivity Clients"
  }
  if ($t -match 'awesome|reference|free-programming|cheatsheet|ai-guide|best-websites|github-repo|awesome-css|ebookfoundation') {
    return "Awesome References"
  }
  return "Read Later"
}

$buckets = @{}
foreach ($name in $listDefs.name) { $buckets[$name] = New-Object System.Collections.Generic.List[object] }

foreach ($s in $stars) {
  $ln = Get-ListName $s.full_name ($s.description)
  $buckets[$ln].Add($s) | Out-Null
}

# summary
$summary = @{}
foreach ($k in $buckets.Keys) { $summary[$k] = $buckets[$k].Count }
$summary | ConvertTo-Json | Set-Content (Join-Path $outDir "_star_buckets_summary.json") -Encoding UTF8
Write-Host "Bucket counts: $($summary | ConvertTo-Json -Compress)"

# 4) Assign each star to its list via updateUserListsForItem
$assignOk = 0
$assignFail = 0
$failLog = New-Object System.Collections.Generic.List[string]

foreach ($listName in $buckets.Keys) {
  $lid = $listIds[$listName]
  if (-not $lid) {
    Write-Host "Skip bucket no list id: $listName"
    continue
  }
  $items = $buckets[$listName]
  Write-Host "Assigning $($items.Count) items to $listName"
  $i = 0
  foreach ($s in $items) {
    $i++
    $itemId = $s.id
    $mut = @"
mutation {
  updateUserListsForItem(input: {itemId: "$itemId", listIds: ["$lid"]}) {
    lists { id name }
  }
}
"@
    $araw = & gh api graphql -f "query=$mut" 2>&1
    if ($LASTEXITCODE -ne 0) {
      $assignFail++
      $failLog.Add("$($s.full_name): $araw") | Out-Null
      continue
    }
    $adata = $araw | ConvertFrom-Json
    if ($adata.errors) {
      $assignFail++
      $failLog.Add("$($s.full_name): $($adata.errors | ConvertTo-Json -Compress)") | Out-Null
    } else {
      $assignOk++
    }
    if (($i % 20) -eq 0) { Write-Host "  $listName progress $i/$($items.Count)" }
  }
}

Write-Host "Assign done ok=$assignOk fail=$assignFail"
$failLog | Set-Content (Join-Path $outDir "_star_assign_fail.log") -Encoding UTF8

# dump read later names
$buckets["Read Later"] | ForEach-Object { $_.full_name } | Set-Content (Join-Path $outDir "_read_later.txt") -Encoding UTF8
Write-Host "DONE"
