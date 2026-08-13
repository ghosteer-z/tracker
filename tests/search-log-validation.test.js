const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const projectRoot = path.join(__dirname, "..");

function createFixture(t, search) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-search-log-"));
  fs.cpSync(path.join(projectRoot, "data"), path.join(root, "data"), { recursive: true });
  fs.mkdirSync(path.join(root, "scripts"));
  fs.copyFileSync(
    path.join(projectRoot, "scripts", "validate-data.js"),
    path.join(root, "scripts", "validate-data.js")
  );
  fs.writeFileSync(
    path.join(root, "data", "search-log.json"),
    `${JSON.stringify({ schema_version: 2, searches: [search] }, null, 2)}\n`
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function broadWebSearch() {
  return {
    id: "wang-ning-2026-08-13-broad-web",
    person_id: "wang-ning",
    search_type: "broad_web",
    channel_id: null,
    platforms: ["哔哩哔哩", "小宇宙", "百度"],
    checked_at: "2026-08-13",
    queries: ["王宁 访谈", "泡泡玛特 王宁 对谈"],
    date_range: null,
    scope: "验证中文全网补充检索的账本格式",
    status: "completed",
    completion_check: {
      planned_queries_executed: true,
      stopping_rule_met: true,
      methods_used: ["web_search"]
    },
    counts: {
      reviewed_results: 3,
      candidates_found: 1,
      added_new: 0,
      merged_duplicates: 0,
      excluded: 1
    },
    accepted_interview_ids: [],
    next_step: "无",
    notes: "仅测试格式，不代表已经执行真实检索"
  };
}

test("全网补充检索可以记录多个平台且不需要 channel_id", t => {
  const root = createFixture(t, broadWebSearch());
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "validate-data.js")], {
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
});

test("completed 检索必须记录完成检查", t => {
  const search = broadWebSearch();
  delete search.completion_check;
  const root = createFixture(t, search);
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "validate-data.js")], {
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /completed 检索必须填写 completion_check/);
});

test("全网补充检索会拦截缺失平台和不自洽的数量", t => {
  const search = broadWebSearch();
  search.platforms = [];
  search.counts.added_new = 1;
  const root = createFixture(t, search);
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "validate-data.js")], {
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /必须写明检查过的平台/);
  assert.match(result.stderr, /新增、合并与排除数量之和必须等于/);
});
