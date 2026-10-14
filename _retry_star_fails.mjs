import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";

function graphql(query, variables = null) {
  const body = variables ? { query, variables } : { query };
  const p = join(tmpdir(), `gh-retry-${Date.now()}-${Math.random()}.json`);
  writeFileSync(p, JSON.stringify(body));
  try {
    const out = execFileSync("gh", ["api", "graphql", "--input", p], {
      encoding: "utf8",
      maxBuffer: 1e7,
    });
    return JSON.parse(out);
  } finally {
    try {
      unlinkSync(p);
    } catch {}
  }
}

const lists = graphql(
  `query { viewer { lists(first: 20) { nodes { id name items(first: 1) { totalCount } } } } }`
);
console.log(
  "lists:",
  JSON.stringify(
    lists.data.viewer.lists.nodes.map((l) => ({
      name: l.name,
      count: l.items.totalCount,
    })),
    null,
    2
  )
);

const listIds = Object.fromEntries(
  lists.data.viewer.lists.nodes.map((l) => [l.name, l.id])
);

const failPath =
  "C:/Users/zhengjiyong/code/NightYuYyy-new/_star_assign_fail.log";
let failLog = "";
try {
  failLog = readFileSync(failPath, "utf8").trim();
} catch {
  console.log("no fail log");
  process.exit(0);
}
if (!failLog) {
  console.log("empty fail log");
  process.exit(0);
}

const names = failLog
  .split(/\n/)
  .map((l) => l.split(":")[0])
  .filter(Boolean);
console.log("retry names:", names);

const raw = execFileSync(
  "gh",
  [
    "api",
    "user/starred",
    "--paginate",
    "-H",
    "Accept: application/vnd.github+json",
  ],
  { encoding: "utf8", maxBuffer: 5e7 }
);
const chunks = [];
let d = 0,
  s = -1;
for (let i = 0; i < raw.length; i++) {
  const c = raw[i];
  if (c === "[") {
    if (d === 0) s = i;
    d++;
  } else if (c === "]") {
    d--;
    if (d === 0 && s >= 0) {
      chunks.push(JSON.parse(raw.slice(s, i + 1)));
      s = -1;
    }
  }
}
const byName = Object.fromEntries(
  chunks.flat().map((r) => [r.full_name, r])
);

const buckets = JSON.parse(
  readFileSync(
    "C:/Users/zhengjiyong/code/NightYuYyy-new/_star_buckets_preview.json",
    "utf8"
  )
);
const nameToList = {};
for (const [list, arr] of Object.entries(buckets)) {
  for (const n of arr) nameToList[n] = list;
}

const mut = `mutation($itemId: ID!, $listIds: [ID!]!) {
  updateUserListsForItem(input: {itemId: $itemId, listIds: $listIds}) {
    lists { id name }
  }
}`;

let ok = 0,
  fail = 0;
for (const name of names) {
  const repo = byName[name];
  const listName = nameToList[name] || "Read Later";
  const lid = listIds[listName];
  if (!repo || !lid) {
    console.log("skip", name, !!repo, listName, !!lid);
    fail++;
    continue;
  }
  try {
    const res = graphql(mut, { itemId: repo.node_id, listIds: [lid] });
    if (res.errors) {
      console.log("err", name, JSON.stringify(res.errors));
      fail++;
    } else {
      console.log("ok", name, "->", listName);
      ok++;
    }
  } catch (e) {
    console.log("ex", name, e.message);
    fail++;
  }
}
console.log({ ok, fail });

// final counts
const final = graphql(
  `query { viewer { lists(first: 20) { nodes { name items(first: 1) { totalCount } } } } }`
);
console.log(
  "final:",
  JSON.stringify(
    final.data.viewer.lists.nodes.map((l) => ({
      name: l.name,
      count: l.items.totalCount,
    })),
    null,
    2
  )
);
