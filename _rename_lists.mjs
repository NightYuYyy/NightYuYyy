import { writeFileSync, unlinkSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";

function graphql(query, variables = null) {
  const body = variables ? { query, variables } : { query };
  const p = join(tmpdir(), `gh-rename-${Date.now()}-${Math.random()}.json`);
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

const renames = {
  "AI Agent Skills": {
    name: "AI Agent 与 Skills",
    description: "Agent 框架、Skills、多 Agent 编排",
  },
  "Claude Codex OpenCode": {
    name: "Claude · Codex · OpenCode",
    description: "Claude Code / Codex / OpenCode 生态与周边工具",
  },
  "AI Proxy Gateway": {
    name: "AI 代理与网关",
    description: "API 中转、多协议代理、负载均衡",
  },
  "Prompt Design UI": {
    name: "提示词 · 设计 · UI",
    description: "提示词、设计系统、PPT/UI Skills",
  },
  "Learn Interview Frontend": {
    name: "学习 · 面试 · 前端",
    description: "八股、算法、Vue/前端学习资料",
  },
  "Ops VPS Network": {
    name: "运维 · VPS · 网络",
    description: "重装、测速、代理客户端、网络工具",
  },
  "Productivity Clients": {
    name: "效率工具 · 客户端",
    description: "微信导出、NAS、油猴、桌面工具",
  },
  "Awesome References": {
    name: "资源大全 · 速查",
    description: "Awesome 清单、速查表、资源导航",
  },
  "Read Later": {
    name: "稍后读",
    description: "暂未分类 / 待消化",
  },
};

const lists = graphql(
  `query { viewer { lists(first: 20) { nodes { id name } } } }`
);
const nodes = lists.data.viewer.lists.nodes;

const mut = `mutation($listId: ID!, $name: String!, $description: String) {
  updateUserList(input: {listId: $listId, name: $name, description: $description}) {
    list { id name description }
  }
}`;

for (const node of nodes) {
  const target = renames[node.name];
  if (!target) {
    console.log("skip (no mapping):", node.name);
    continue;
  }
  const res = graphql(mut, {
    listId: node.id,
    name: target.name,
    description: target.description,
  });
  if (res.errors) {
    console.error("FAIL", node.name, JSON.stringify(res.errors));
  } else {
    console.log("OK", node.name, "->", res.data.updateUserList.list.name);
  }
}

const final = graphql(
  `query { viewer { lists(first: 20) { nodes { name description items(first: 1) { totalCount } } } } }`
);
console.log(
  "\n最终列表:",
  JSON.stringify(
    final.data.viewer.lists.nodes.map((l) => ({
      name: l.name,
      count: l.items.totalCount,
      desc: l.description,
    })),
    null,
    2
  )
);
