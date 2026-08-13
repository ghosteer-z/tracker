const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const personId = process.argv[2];
const fromIndex = process.argv.indexOf("--from");
const toIndex = process.argv.indexOf("--to");
const from = fromIndex >= 0 ? process.argv[fromIndex + 1] : null;
const to = toIndex >= 0 ? process.argv[toIndex + 1] : new Date().toISOString().slice(0, 10);

if (!personId) {
  console.error("用法：npm run search-plan -- <person_id> [--from YYYY-MM-DD] [--to YYYY-MM-DD]");
  process.exit(1);
}

function readData(filename) {
  return JSON.parse(fs.readFileSync(path.join(root, "data", filename), "utf8"));
}

function domainOf(url) {
  return new URL(url).hostname.replace(/^www\./, "");
}

function quote(value) {
  return /\s/.test(value) ? `"${value}"` : value;
}

function buildPlan(person, channelGroup) {
  const names = [...new Set([person.name, ...(person.aliases || [])])];
  const intentWords = ["访谈", "专访", "对话", "播客", "完整版"];
  const trustedChannels = channelGroup.channels.map(channel => {
    const domain = domainOf(channel.url);
    return {
      channel_id: channel.id,
      channel_name: channel.name,
      domain,
      queries: names.flatMap(name => intentWords.map(word =>
        `site:${domain} ${quote(channel.name)} ${quote(name)} ${word}`
      )),
      completion_check: {
        methods_used: ["web_site_query"],
        required_query_coverage: "执行本渠道计划中的全部查询；重复结果可跳过，但不得省略人物别名",
        stopping_rule: "检查到结果耗尽，或连续两页没有出现新的待判断候选",
        restriction_rule: "遇到登录、robots、站内索引或分页限制时标记 partial 或 blocked，不标 completed"
      }
    };
  });
  return {
    generated_at: new Date().toISOString(),
    person_id: person.id,
    person_name: person.name,
    date_range: { from, to },
    trusted_channels: trustedChannels,
    broad_web: {
      queries: names.flatMap(name => ["访谈", "专访", "对谈", "播客", "完整视频", "文字实录"]
        .map(word => `${quote(name)} ${word}`)),
      instruction: "完成可信渠道定向搜索后执行；发现持续产出合格内容的新原始发布者时，再登记到 channels.json"
    }
  };
}

const people = readData("people.json").people;
const channelGroups = readData("channels.json").people;
const person = people.find(item => item.id === personId);
const channelGroup = channelGroups.find(item => item.person_id === personId);
if (!person || !channelGroup) {
  console.error(`找不到人物或来源组：${personId}`);
  process.exit(1);
}

console.log(JSON.stringify(buildPlan(person, channelGroup), null, 2));

module.exports = { buildPlan, domainOf };
