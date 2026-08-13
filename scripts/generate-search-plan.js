const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const personId = process.argv[2];
const fromIndex = process.argv.indexOf("--from");
const toIndex = process.argv.indexOf("--to");
const formatIndex = process.argv.indexOf("--format");
const outputIndex = process.argv.indexOf("--output");
const from = fromIndex >= 0 ? process.argv[fromIndex + 1] : null;
const to = toIndex >= 0 ? process.argv[toIndex + 1] : new Date().toISOString().slice(0, 10);
const format = formatIndex >= 0 ? process.argv[formatIndex + 1] : "markdown";
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;

if (!personId) {
  console.error("用法：npm run search-plan -- <person_id> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--format markdown|json] [--output <文件路径>]");
  process.exit(1);
}
if (!new Set(["markdown", "json"]).has(format)) {
  console.error("--format 只能是 markdown 或 json");
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

function domainsOf(channel) {
  return channel.search_domains || [domainOf(channel.url)];
}

function buildPlan(person, channelGroup) {
  const names = [...new Set([person.name, ...(person.aliases || [])])];
  const intentWords = ["访谈", "专访", "对话", "播客", "完整版"];
  const trustedChannels = channelGroup.channels.map(channel => {
    const domains = domainsOf(channel);
    return {
      channel_id: channel.id,
      channel_name: channel.name,
      domains,
      queries: domains.flatMap(domain => names.flatMap(name => intentWords.map(word =>
        `site:${domain} ${quote(channel.name)} ${quote(name)} ${word}`
      ))),
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

function checkbox(query) {
  return `- [ ] \`${query}\``;
}

function buildMarkdown(plan) {
  const range = plan.date_range.from ? `${plan.date_range.from} 至 ${plan.date_range.to}` : `截至 ${plan.date_range.to}`;
  const lines = [
    `# ${plan.person_name}访谈搜索清单`,
    "",
    `- 人物编号：\`${plan.person_id}\``,
    `- 发布时间范围：${range}`,
    "- 执行顺序：先完成全部可信来源定向搜索，再执行全网补充搜索。",
    ""
  ];
  for (const channel of plan.trusted_channels) {
    lines.push(`## ${channel.channel_name}`, "", `渠道编号：\`${channel.channel_id}\``, `搜索域名：${channel.domains.map(domain => `\`${domain}\``).join("、")}`, "");
    lines.push(...channel.queries.map(checkbox), "");
    lines.push(
      "执行检查：",
      "",
      "- [ ] 以上计划查询已全部执行",
      "- [ ] 已检查到结果耗尽，或连续两页没有新的待判断候选",
      "- [ ] 重要排除项已登记到 reviewed-candidates.json",
      "- [ ] 如遇登录、robots、分页或索引限制，状态已标为 partial 或 blocked",
      "",
      "结果记录：",
      "",
      "- 状态：",
      "- 实际搜索方法：",
      "- 查看结果数：",
      "- 候选数：",
      "- 新增 / 合并 / 排除：",
      "- 备注：",
      ""
    );
  }
  lines.push("## 全网补充搜索", "", plan.broad_web.instruction, "", ...plan.broad_web.queries.map(checkbox), "");
  lines.push("- [ ] 已记录实际检查的平台", "- [ ] 重要排除项已登记", "- [ ] 新发现的持续性原始来源已评估是否加入 channels.json", "");
  return `${lines.join("\n")}\n`;
}

const people = readData("people.json").people;
const channelGroups = readData("channels.json").people;
const person = people.find(item => item.id === personId);
const channelGroup = channelGroups.find(item => item.person_id === personId);
if (!person || !channelGroup) {
  console.error(`找不到人物或来源组：${personId}`);
  process.exit(1);
}

const plan = buildPlan(person, channelGroup);
const output = format === "json" ? `${JSON.stringify(plan, null, 2)}\n` : buildMarkdown(plan);
if (outputPath) {
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, output, "utf8");
  console.log(`搜索清单已生成：${resolved}`);
} else {
  process.stdout.write(output);
}

module.exports = { buildPlan, buildMarkdown, domainOf, domainsOf };
