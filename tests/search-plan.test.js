const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const script = path.join(__dirname, "..", "scripts", "generate-search-plan.js");

test("搜索计划先生成可信域名查询，再生成全网补充查询", () => {
  const result = spawnSync(process.execPath, [script, "wang-ning", "--from", "2026-01-01", "--to", "2026-08-13"], {
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
  assert.ok(plan.broad_web.queries.some(query => query.includes("文字实录")));
});
