const fs = require("node:fs");
const path = require("node:path");
const { sourceIdentity } = require("./dedup-core");

const root = path.join(__dirname, "..");
const args = process.argv.slice(2);
const allowedReasons = new Map([
  ["not_primary", "不是一手原始来源"],
  ["incomplete", "内容不完整"],
  ["not_conversation", "不是谈话型内容"],
  ["excluded_event", "属于业绩会、新闻发布会或股东会等排除类型"],
  ["person_not_participating", "目标人物没有实际参与"],
  ["outside_date_range", "发布时间不在本轮检索范围"],
  ["duplicate_source", "只是已有访谈的重复来源"],
  ["other", "其他原因"]
]);

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

const personId = option("--person");
const url = option("--url");
const title = option("--title");
const reasonCode = option("--reason");
const note = option("--note");

if (!personId || !url || !title || !reasonCode) {
  console.error("用法：npm run review -- --person <person_id> --url <链接> --title <标题> --reason <原因代码> [--note <补充说明>]");
  console.error(`原因代码：${[...allowedReasons.keys()].join("、")}`);
  process.exit(1);
}
if (!allowedReasons.has(reasonCode)) {
  console.error(`不支持的原因代码 ${reasonCode}；可用值：${[...allowedReasons.keys()].join("、")}`);
  process.exit(1);
}
try {
  const parsed = new URL(url);
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) throw new Error("protocol");
} catch {
  console.error("--url 必须是有效的 http(s) 链接");
  process.exit(1);
}

const people = JSON.parse(fs.readFileSync(path.join(root, "data", "people.json"), "utf8")).people;
if (!people.some(person => person.id === personId)) {
  console.error(`找不到人物：${personId}`);
  process.exit(1);
}

const filePath = path.join(root, "data", "reviewed-candidates.json");
const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
const existing = data.entries.find(entry =>
  entry.person_id === personId && sourceIdentity(entry.url) === sourceIdentity(url)
);
if (existing) {
  console.error(`该链接已于 ${existing.reviewed_at} 登记为排除项：${existing.reasons.join("；")}`);
  process.exit(2);
}

const entry = {
  id: `reviewed-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  person_id: personId,
  url,
  title,
  decision: "excluded",
  reason_codes: [reasonCode],
  reasons: [note || allowedReasons.get(reasonCode)],
  reviewed_at: new Date().toISOString().slice(0, 10)
};
fs.writeFileSync(filePath, `${JSON.stringify({ ...data, entries: [...data.entries, entry] }, null, 2)}\n`, "utf8");
console.log(`已登记排除候选：${title}`);
console.log(`- ${entry.reasons[0]}`);
