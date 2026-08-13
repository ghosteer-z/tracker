const test = require("node:test");
const assert = require("node:assert/strict");

const { buildReport } = require("../scripts/generate-report");

const person = { id: "sample-person", name: "示例人物" };
const baseInterview = {
  id: "sample-person-2025-01-02-show",
  person_id: "sample-person",
  title: "完整对谈",
  program: "示例节目",
  interview_type: "one_on_one",
  other_participants: ["主持人"],
  published_date: "2025-01-02",
  source: {
    type: "video",
    url: "https://example.com/full-video",
    publisher: "节目制作方"
  },
  content_summary: "这是项目方对完整内容所作的概括。",
  key_points: [{ summary: "关键内容", locator: "12:30" }],
  content_review: {
    verification_status: "partial",
    evidence_url: "https://example.com/full-video",
    reviewed_at: "2026-08-13"
  }
};

test("报告包含唯一一手来源、摘要、定位和核验提示", () => {
  const report = buildReport({
    person,
    interviews: [baseInterview],
    searches: [{
      person_id: "sample-person",
      search_type: "trusted_channel",
      status: "completed",
      checked_at: "2026-08-13",
      date_range: { from: "2025-01-01", to: "2026-08-13" }
    }]
  });

  assert.match(report, /共收录 \*\*1 场\*\*/);
  assert.match(report, /\[完整视频 · 节目制作方\]\(https:\/\/example\.com\/full-video\)/);
  assert.match(report, /关键内容（定位：12:30）/);
  assert.match(report, /部分核验（尚未逐段核对完整内容）/);
});

test("报告只包含目标人物并按发布日期倒序排列", () => {
  const later = { ...baseInterview, id: "later", title: "较晚访谈", published_date: "2025-02-01" };
  const earlier = { ...baseInterview, id: "earlier", title: "较早访谈", published_date: "2025-01-01" };
  const anotherPerson = { ...baseInterview, id: "other", person_id: "other-person", title: "不应出现" };
  const report = buildReport({ person, interviews: [later, anotherPerson, earlier], searches: [] });

  assert.ok(report.indexOf("较晚访谈") < report.indexOf("较早访谈"));
  assert.doesNotMatch(report, /不应出现/);
});

test("报告只展示已完成检索窗口内的访谈", () => {
  const report = buildReport({
    person,
    interviews: [
      { ...baseInterview, id: "inside", published_date: "2025-06-01", title: "窗口内访谈" },
      { ...baseInterview, id: "outside", published_date: "2024-12-31", title: "窗口外访谈" }
    ],
    searches: [{
      person_id: person.id,
      status: "completed",
      search_type: "broad_web",
      checked_at: "2026-08-13",
      date_range: { from: "2025-01-01", to: "2026-08-13" }
    }]
  });
  assert.match(report, /窗口内访谈/);
  assert.doesNotMatch(report, /窗口外访谈/);
});
