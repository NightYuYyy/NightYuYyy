import { writeFileSync, unlinkSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";

function graphql(query, variables = null) {
  const body = variables ? { query, variables } : { query };
  const p = join(tmpdir(), `gh-r2-${Date.now()}-${Math.random()}.json`);
  writeFileSync(p, JSON.stringify(body));
  try {
    return JSON.parse(
      execFileSync("gh", ["api", "graphql", "--input", p], {
        encoding: "utf8",
      })
    );
  } finally {
    try {
      unlinkSync(p);
    } catch {}
  }
}

const maps = {
  "Claude Codex OpenCode": {
    name: "Claude · Codex · OpenCode",
    description: "Claude Code / Codex / OpenCode 生态与周边工具",
  },
  "AI Agent Skills": {
    name: "AI Agent 与 Skills",
    description: "Agent 框架、Skills、多 Agent 编排",
  },
};

const lists = graphql(
  `query { viewer { lists(first: 20) { nodes { id name } } } }`
);
const mut = `mutation($listId: ID!, $name: String!, $description: String) {
  updateUserList(input: {listId: $listId, name: $name, description: $description}) {
    list { id name }
  }
}`;

for (const n of lists.data.viewer.lists.nodes) {
  const t = maps[n.name];
  if (!t) {
    console.log("keep", n.name);
    continue;
  }
  try {
    const res = graphql(mut, {
      listId: n.id,
      name: t.name,
      description: t.description,
    });
    if (res.errors) console.log("FAIL", n.name, JSON.stringify(res.errors));
    else console.log("OK", n.name, "->", res.data.updateUserList.list.name);
  } catch (e) {
    console.log("EX", n.name, e.message);
  }
}

const final = graphql(
  `query { viewer { lists(first: 20) { nodes { name items(first: 1) { totalCount } } } } }`
);
console.log(
  JSON.stringify(
    final.data.viewer.lists.nodes.map((l) => ({
      name: l.name,
      count: l.items.totalCount,
    })),
    null,
    2
  )
);
