import { writeFileSync, unlinkSync } from "fs";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = __dirname;

function ghJson(args, inputObj = null) {
  const opts = { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 };
  if (inputObj) {
    const p = join(tmpdir(), `gh-input-${Date.now()}-${Math.random()}.json`);
    writeFileSync(p, JSON.stringify(inputObj), "utf8");
    try {
      const out = execFileSync("gh", [...args, "--input", p], opts);
      return JSON.parse(out);
    } finally {
      try { unlinkSync(p); } catch {}
    }
  }
  const out = execFileSync("gh", args, opts);
  return JSON.parse(out);
}

function graphql(query, variables = null) {
  const body = variables ? { query, variables } : { query };
  return ghJson(["api", "graphql"], body);
}

// --- 1) Fetch stars via REST (includes node_id) ---
console.log("Fetching starred repos...");
const starsRaw = execFileSync(
  "gh",
  ["api", "user/starred", "--paginate", "-H", "Accept: application/vnd.github+json"],
  { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }
);
// paginate may return concatenated JSON arrays
const chunks = [];
let depth = 0, start = -1;
for (let i = 0; i < starsRaw.length; i++) {
  const c = starsRaw[i];
  if (c === "[") {
    if (depth === 0) start = i;
    depth++;
  } else if (c === "]") {
    depth--;
    if (depth === 0 && start >= 0) {
      chunks.push(JSON.parse(starsRaw.slice(start, i + 1)));
      start = -1;
    }
  }
}
const stars = chunks.flat().map((r) => ({
  id: r.node_id,
  full_name: r.full_name,
  description: r.description || "",
  html_url: r.html_url,
}));
console.log(`Stars: ${stars.length}`);
writeFileSync(join(outDir, "_stars_raw.json"), JSON.stringify(stars, null, 2));

// --- 2) Create lists ---
const listDefs = [
  { name: "AI Agent Skills", desc: "Agent frameworks, skills, orchestration" },
  { name: "Claude Codex OpenCode", desc: "Claude Code / Codex / OpenCode ecosystem" },
  { name: "AI Proxy Gateway", desc: "API proxies, relays, multi-provider gateways" },
  { name: "Prompt Design UI", desc: "Prompts, design systems, PPT/UI skills" },
  { name: "Learn Interview Frontend", desc: "Interview, algorithms, Vue/frontend learning" },
  { name: "Ops VPS Network", desc: "VPS, reinstall, proxy clients, networking" },
  { name: "Productivity Clients", desc: "WeChat export, NAS, userscripts, utilities" },
  { name: "Awesome References", desc: "Awesome lists, cheatsheets, resource guides" },
  { name: "Read Later", desc: "Uncategorized / to review later" },
];

const exist = graphql(`query { viewer { lists(first: 32) { nodes { id name } } } }`);
const existing = Object.fromEntries(
  (exist.data?.viewer?.lists?.nodes || []).map((l) => [l.name, l.id])
);

const listIds = {};
for (const def of listDefs) {
  if (existing[def.name]) {
    listIds[def.name] = existing[def.name];
    console.log(`List exists: ${def.name}`);
    continue;
  }
  const mut = `
    mutation($name: String!, $description: String!, $isPrivate: Boolean!) {
      createUserList(input: {name: $name, description: $description, isPrivate: $isPrivate}) {
        list { id name }
      }
    }`;
  const res = graphql(mut, {
    name: def.name,
    description: def.desc,
    isPrivate: true,
  });
  if (res.errors) {
    console.error("Create list failed", def.name, JSON.stringify(res.errors));
    continue;
  }
  listIds[def.name] = res.data.createUserList.list.id;
  console.log(`Created: ${def.name} -> ${listIds[def.name]}`);
}
writeFileSync(join(outDir, "_list_ids.json"), JSON.stringify(listIds, null, 2));

// --- 3) Classify ---
function classify(full, desc) {
  const t = `${full} ${desc}`.toLowerCase();

  if (
    t.match(
      /proxy|relay|gateway|anyrouter|new-api|newapi|one-api|oneapi|aiclient2api|claude-relay|amp-manager/
    )
  ) {
    return "AI Proxy Gateway";
  }
  if (
    t.match(
      /claude-code-hub|cc-switch|cc-connect|codex-threads|opencode|claude-code|oh-my-codex|oh-my-openagent|oh-my-claudecode|spec-workflow-mcp|shnote|claude code hub/
    )
  ) {
    return "Claude Codex OpenCode";
  }
  if (
    t.match(
      /superpowers|ponytail|hermes-agent|multi-agent|agentic|ai-agent|ainovel|persona-skill|wshobson\/agents|wshobson\/commands|shrimp-task|mcp-feedback|agent skill|skills framework|ai manus/
    ) ||
    (t.includes("skill") && t.match(/agent|claude|codex|cursor|prompt/))
  ) {
    return "AI Agent Skills";
  }
  if (
    t.match(
      /design-md|ui-ux-pro|prompt as code|gpt-image|persona|shadcn|gordenppt|awesome-design|awesome-gpt-image/
    )
  ) {
    return "Prompt Design UI";
  }
  if (
    t.match(
      /interview|leetcode|algorithm|frontend|front-end|roadmap|33-js|fucking-algorithm|cs-base|thealgorithms|fe-interview|javascript-algorithms|daily-question|learning-vue|element-admin|vue3|vue-element|all-of-frontend|frontend-hard/
    )
  ) {
    return "Learn Interview Frontend";
  }
  if (
    t.match(
      /reinstall|ipquality|hardwarequality|clash|quantumult|shadowrocket|nginxconfig|lazydocker|dev-sidecar|ddgksf|flclash|thanks-mirror|github520|linux-command/
    )
  ) {
    return "Ops VPS Network";
  }
  if (
    t.match(
      /wechat|weflow|wechatmsg|moviepilot|userscript|gm_script|pearcleaner|xianyu|trilium|tampermonkey|greasemonkey|koro1fileheader|pywxdump|bulk-crap|qbittorrent|jarkviewer/
    )
  ) {
    return "Productivity Clients";
  }
  if (
    t.match(
      /awesome-|\/awesome|reference|free-programming-books|cheatsheet|ai-guide|best-websites|awesome-github|awesome-css|ebookfoundation|awesome-mcp|awesome-vitepress/
    )
  ) {
    return "Awesome References";
  }
  // secondary agent catch
  if (t.match(/\bagents?\b|mcp server|model context protocol/)) {
    return "AI Agent Skills";
  }
  return "Read Later";
}

const buckets = Object.fromEntries(listDefs.map((d) => [d.name, []]));
for (const s of stars) {
  const list = classify(s.full_name, s.description);
  buckets[list].push(s);
}

const summary = Object.fromEntries(
  Object.entries(buckets).map(([k, v]) => [k, v.length])
);
console.log("Buckets:", summary);
writeFileSync(join(outDir, "_star_buckets_summary.json"), JSON.stringify(summary, null, 2));
writeFileSync(
  join(outDir, "_read_later.txt"),
  buckets["Read Later"].map((s) => s.full_name).join("\n")
);

// --- 4) Assign ---
let ok = 0,
  fail = 0;
const fails = [];
const mut = `
  mutation($itemId: ID!, $listIds: [ID!]!) {
    updateUserListsForItem(input: {itemId: $itemId, listIds: $listIds}) {
      lists { id name }
    }
  }`;

for (const [listName, items] of Object.entries(buckets)) {
  const lid = listIds[listName];
  if (!lid) {
    console.error("No list id for", listName);
    continue;
  }
  console.log(`Assigning ${items.length} -> ${listName}`);
  let i = 0;
  for (const s of items) {
    i++;
    try {
      const res = graphql(mut, { itemId: s.id, listIds: [lid] });
      if (res.errors) {
        fail++;
        fails.push(`${s.full_name}: ${JSON.stringify(res.errors)}`);
      } else {
        ok++;
      }
    } catch (e) {
      fail++;
      fails.push(`${s.full_name}: ${e.message}`);
    }
    if (i % 25 === 0) console.log(`  ${listName} ${i}/${items.length}`);
  }
}

console.log(`Assign done ok=${ok} fail=${fail}`);
writeFileSync(join(outDir, "_star_assign_fail.log"), fails.join("\n"));
writeFileSync(
  join(outDir, "_star_assign_result.json"),
  JSON.stringify({ ok, fail, summary }, null, 2)
);
console.log("DONE");
