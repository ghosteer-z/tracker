const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const projectRoot = path.join(__dirname, "..");

function validateFixture(t, mutate) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-content-summary-"));
  fs.cpSync(path.join(projectRoot, "data"), path.join(root, "data"), { recursive: true });
  fs.mkdirSync(path.join(root, "scripts"));
  fs.copyFileSync(path.join(projectRoot, "scripts", "validate-data.js"), path.join(root, "scripts", "validate-data.js"));
  const interviewsPath = path.join(root, "data", "interviews.json");
  const data = JSON.parse(fs.readFileSync(interviewsPath, "utf8"));
  mutate(data.interviews.find(record => record.id === "wang-ning-2025-07-21-886ad5a6"));
  fs.writeFileSync(interviewsPath, `${JSON.stringify(data, null, 2)}\n`);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return spawnSync(process.execPath, [path.join(root, "scripts", "validate-data.js")], { encoding: "utf8" });
}

test("完整的内容摘要、观点定位和核验记录可以通过", t => {
  const result = validateFixture(t, () => {});
  assert.equal(result.status, 0, result.stderr);
});

test("内容字段不完整会被拦截", t => {
  const result = validateFixture(t, interview => {
    delete interview.content_review;
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /必须同时填写/);
});

test("关键观点缺少原文定位会被拦截", t => {
  const result = validateFixture(t, interview => {
    interview.key_points[0].locator = "";
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /locator 必须是非空文字/);
});
