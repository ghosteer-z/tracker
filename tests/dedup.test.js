const test = require("node:test");
const assert = require("node:assert/strict");
const { processCandidate, validateCandidateShape } = require("../scripts/dedup-core");

const knownChannels = new Map([
  ["wang-ning", new Set(["yangsheng", "cctv", "high-energy"])]
]);

function interview(overrides = {}) {
  return {
    id: "wang-ning-2026-01-23-yangsheng",
    person_id: "wang-ning",
    title: "张扬对话王宁：中国潮玩为何能风靡全球",
    program: "扬声 第2季 第3集",
    interview_type: "one_on_one",
    other_participants: ["张扬"],
    published_date: "2026-01-23",
    event_date: null,
    source: {
      type: "video",
      url: "https://trusted.example/yangsheng",
      publisher: "扬声",
      channel_id: "yangsheng",
      language: "zh-CN"
    },
    topics: ["潮玩"],
    ...overrides
  };
}

function candidate(overrides = {}) {
  const base = interview({
    id: undefined,
    published_date: "2026-03-30",
    source: {
      type: "video",
      url: "https://outside.example/same-interview",
      publisher: "另一原发方",
      channel_id: null,
      language: "zh-CN"
    },
    screening: {
      is_primary: true,
      is_complete: true,
      is_conversation: true,
      is_excluded_event: false
    }
  });
  return { ...base, ...overrides };
}

test("同一访谈、相同完整度时保留已登记来源", () => {
  const existing = interview();
  const result = processCandidate({ interviews: [existing], channelsByPerson: knownChannels }, candidate());
  assert.equal(result.entry.action, "kept_existing");
  assert.equal(result.interviews.length, 1);
  assert.equal(result.interviews[0].source.url, existing.source.url);
});

test("同一访谈发现完整底稿后自动替换视频", () => {
  const result = processCandidate(
    { interviews: [interview()], channelsByPerson: knownChannels },
    candidate({
      source: {
        type: "transcript",
        url: "https://outside.example/full-transcript",
        publisher: "另一原发方",
        channel_id: null,
        language: "zh-CN"
      }
    })
  );
  assert.equal(result.entry.action, "replaced_source");
  assert.equal(result.interviews[0].source.type, "transcript");
});

test("不同节目自动作为新访谈收录", () => {
  const result = processCandidate(
    { interviews: [interview()], channelsByPerson: knownChannels },
    candidate({
      title: "王宁谈组织建设与泡泡玛特未来",
      program: "高能量 Vol.215",
      other_participants: ["李翔", "李丰"],
      published_date: "2026-05-06",
      source: {
        type: "audio",
        url: "https://outside.example/high-energy",
        publisher: "高能量",
        channel_id: "high-energy",
        language: "zh-CN"
      }
    })
  );
  assert.equal(result.entry.action, "added_new");
  assert.equal(result.interviews.length, 2);
});

test("不完整或排除类型不进入访谈清单", () => {
  const incomplete = candidate({
    screening: {
      is_primary: true,
      is_complete: false,
      is_conversation: true,
      is_excluded_event: true
    }
  });
  const result = processCandidate({ interviews: [interview()], channelsByPerson: knownChannels }, incomplete);
  assert.equal(result.entry.action, "excluded");
  assert.equal(result.interviews.length, 1);
  assert.ok(result.entry.reasons.length >= 2);
});

test("格式错误的候选会在写入前被拒绝", () => {
  const invalid = candidate({ published_date: "not-a-date" });
  const errors = validateCandidateShape(invalid, new Set(["wang-ning"]));
  assert.ok(errors.some(error => error.includes("published_date")));
});
