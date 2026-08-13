const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const script = path.join(__dirname, "..", "scripts", "generate-search-plan.js");

test("搜索计划先生成可信域名查询，再生成全网补充查询", () => {
  const result = spawnSync(process.execPath, [script, "wang-ning", "--from", "2026-01-01", "--to", "2026-08-13", "--format", "json"], {
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.person_id, "wang-ning");
  assert.equal(plan.date_range.from, "2026-01-01");
  assert.ok(plan.trusted_channels.length > 0);
  assert.ok(plan.trusted_channels.every(channel => channel.queries.every(query =>
    query.startsWith("site:") && query.includes(channel.channel_name)
  )));
  const peopleDaily = plan.trusted_channels.find(channel => channel.channel_id === "people-daily");
  assert.deepEqual(peopleDaily.domains, ["people.com.cn", "paper.people.com.cn"]);
  assert.ok(peopleDaily.queries.some(query => query.startsWith("site:paper.people.com.cn")));
  assert.ok(plan.broad_web.queries.some(query => query.includes("文字实录")));
});

test("搜索计划默认输出可勾选的 Markdown 清单", () => {
  const result = spawnSync(process.execPath, [script, "wang-ning", "--from", "2026-01-01"], {
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^# 王宁访谈搜索清单/m);
  assert.match(result.stdout, /- \[ \] `site:tv\.cctv\.com/);
  assert.match(result.stdout, /## 全网补充搜索/);
  assert.match(result.stdout, /重要排除项已登记/);
});
