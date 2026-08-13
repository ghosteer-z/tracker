const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");

const labels = {
  sourceType: {
    transcript: "完整文字底稿",
    video: "完整视频",
    audio: "完整音频"
  },
  interviewType: {
    one_on_one: "一对一访谈",
    group_conversation: "多人对谈"
  },
  verificationStatus: {
    verified: "已核对完整内容",
    partial: "部分核验（尚未逐段核对完整内容）"
  }
};

function readJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, "data", filename), "utf8"));
}

function getCoverage(searches, personId) {
  const completed = searches.filter(search =>
    search.person_id === personId
    && search.status === "completed"
    && search.date_range
  );

  if (completed.length === 0) return null;

  const trustedChannelRuns = completed.filter(search => search.search_type === "trusted_channel").length;
  const broadWebRuns = completed.filter(search => search.search_type === "broad_web").length;

  return {
    from: completed.map(search => search.date_range.from).sort()[0],
    to: completed.map(search => search.date_range.to).sort().at(-1),
    checkedAt: completed.map(search => search.checked_at).sort().at(-1),
    trustedChannelRuns,
    broadWebRuns
  };
}

function buildReport({ person, interviews, searches }) {
  const coverage = getCoverage(searches, person.id);
  const records = interviews
    .filter(interview => interview.person_id === person.id)
    .filter(interview => !person.tracking_from || interview.published_date >= person.tracking_from)
    .filter(interview => !coverage
      || (interview.published_date >= coverage.from && interview.published_date <= coverage.to))
    .sort((left, right) => right.published_date.localeCompare(left.published_date));

  if (records.length === 0) throw new Error(`人物 ${person.id} 暂无已收录访谈`);

  const verifiedCount = records.filter(record => record.content_review?.verification_status === "verified").length;
  const partialCount = records.filter(record => record.content_review?.verification_status === "partial").length;
  const pendingCount = records.length - verifiedCount - partialCount;
  const lines = [
    `# ${person.name}完整访谈报告`,
    "",
    `共收录 **${records.length} 场**符合规则的完整访谈；每场只保留一个最佳一手来源。`,
    ""
  ];

  if (coverage) {
    lines.push(
      `- 检索发布日期范围：${coverage.from} 至 ${coverage.to}`,
      `- 最后检索日期：${coverage.checkedAt}`,
      `- 检索执行：${coverage.trustedChannelRuns} 次可信来源定向检索，${coverage.broadWebRuns} 次全网补充检索`
    );
  }

  lines.push(
    ...(person.tracking_from ? [`- 统一追踪起点：${person.tracking_from}`] : []),
    `- 内容核验：${verifiedCount} 场已核对完整内容，${partialCount} 场部分核验，${pendingCount} 场待整理`,
    "",
    "> 范围说明：本报告只覆盖检索账本注明的日期与公开可检索范围，不代表更早历史内容或受限平台内部内容已全部覆盖。所有概括均为项目方转述，不是人物原话。标为“部分核验”的内容仅依据原始节目方简介和时间轴整理，引用前应返回完整来源复核。",
    "",
    "## 访谈清单",
    ""
  );

  records.forEach((record, index) => {
    const review = record.content_review;
    const participants = record.other_participants.length > 0
      ? record.other_participants.join("、")
      : "原始页面未列明";

    lines.push(
      `### ${index + 1}. ${record.title}`,
      "",
      `- 发布日期：${record.published_date}`,
      `- 节目：${record.program}`,
      `- 形式：${labels.interviewType[record.interview_type] || record.interview_type}`,
      `- 其他主要参与者：${participants}`,
      `- 一手来源：[${labels.sourceType[record.source.type] || record.source.type} · ${record.source.publisher}](${record.source.url})`,
      `- 内容核验：${review ? labels.verificationStatus[review.verification_status] : "待整理"}`,
      ""
    );

    if (!review) {
      lines.push("本场尚未整理内容摘要。", "");
      return;
    }

    lines.push("**内容概括**", "", record.content_summary, "", "**关键内容**", "");
    record.key_points.forEach(point => {
      lines.push(`- ${point.summary}（定位：${point.locator}）`);
    });
    lines.push(
      "",
      `核验依据：[打开内容整理所依据的一手页面](${review.evidence_url})；核验日期：${review.reviewed_at}。`,
      ""
    );
  });

  lines.push(
    "## 核验状态说明",
    "",
    "- 已核对完整内容：已检查完整文字、视频或音频，可以直接依据所列定位回查。",
    "- 部分核验：已确认一手完整来源，但当前摘要主要依据节目方简介或时间轴，尚未完成逐段听审或观看。",
    "- 待整理：访谈已经收录，但尚未建立内容摘要。",
    ""
  );

  return lines.join("\n");
}

function generate(personId, outputPath) {
  const people = readJson("people.json").people;
  const person = people.find(item => item.id === personId);
  if (!person) throw new Error(`找不到人物：${personId}`);

  const report = buildReport({
    person,
    interviews: readJson("interviews.json").interviews,
    searches: readJson("search-log.json").searches
  });

  const target = outputPath || path.join(projectRoot, "reports", `${personId}.md`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, report, "utf8");
  return target;
}

if (require.main === module) {
  const personId = process.argv[2];
  if (!personId) {
    console.error("用法：npm run report -- <person_id> [输出文件]");
    process.exit(1);
  }

  try {
    const target = generate(personId, process.argv[3]);
    console.log(`报告已生成：${target}`);
  } catch (error) {
    console.error(`报告生成失败：${error.message}`);
    process.exit(1);
  }
}

module.exports = { buildReport, getCoverage, generate };
