const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const projectRoot = path.join(__dirname, "..");

function createFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-review-"));
  fs.mkdirSync(path.join(root, "scripts"));
  fs.mkdirSync(path.join(root, "data"));
  for (const filename of ["review-candidate.js", "dedup-core.js"]) {
    fs.copyFileSync(path.join(projectRoot, "scripts", filename), path.join(root, "scripts", filename));
  }
  fs.copyFileSync(path.join(projectRoot, "data", "people.json"), path.join(root, "data", "people.json"));
  fs.writeFileSync(path.join(root, "data", "reviewed-candidates.json"), '{"schema_version":1,"entries":[]}\n');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("可以手工登记排除候选并阻止同一链接重复登记", t => {
  const root = createFixture(t);
  const args = [
    path.join(root, "scripts", "review-candidate.js"),
    "--person", "wang-ning",
    "--url", "https://example.com/watch?id=1&utm_source=test",
    "--title", "三分钟采访剪辑",
    "--reason", "incomplete"
  ];
  const first = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);
  const data = JSON.parse(fs.readFileSync(path.join(root, "data", "reviewed-candidates.json"), "utf8"));
  assert.equal(data.entries.length, 1);
  assert.deepEqual(data.entries[0].reason_codes, ["incomplete"]);

  args[args.indexOf("https://example.com/watch?id=1&utm_source=test")] = "https://example.com/watch?id=1&utm_campaign=again";
  const repeated = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(repeated.status, 2);
  assert.match(repeated.stderr, /已于.*登记为排除项/);
});
