const assert = require("node:assert/strict");
const test = require("node:test");
const { buildSearchEntry, option } = require("../scripts/create-search-log");

const person = { id: "jensen-huang", name: "黄仁勋", aliases: ["Jensen Huang"], search_qualifiers: ["NVIDIA"] };
const channelGroup = {
  person_id: "jensen-huang",
  channels: [{ id: "nvidia-youtube", name: "NVIDIA YouTube", type: "youtube", url: "https://youtube.com/@NVIDIA" }]
};

function values(overrides = {}) {
  return {
    channel: "nvidia-youtube",
    broadWeb: false,
    checkedAt: "2026-08-13",
    from: "2025-01-01",
    to: "2026-08-13",
    status: "completed",
    reviewed: "4",
    candidates: "2",
    added: "1",
    merged: "0",
    excluded: "1",
    platforms: "YouTube",
    methods: "channel_search,web_site_query",
    accepted: "sample-interview",
    scope: "测试范围",
    nextStep: "从次日继续",
    notes: "测试记录",
    queriesComplete: true,
    stoppingRuleMet: true,
    ...overrides
  };
}

test("检索账本草稿复用搜索计划并生成完成检查", () => {
  const entry = buildSearchEntry({ person, channelGroup, existingSearches: [], values: values() });
  assert.equal(entry.search_type, "trusted_channel");
  assert.ok(entry.queries.length <= 6);
  assert.ok(entry.queries.some(query => query.includes("NVIDIA")));
  assert.equal(entry.completion_check.planned_queries_executed, true);
});

test("检索账本拒绝数量不自洽及虚假的 completed", () => {
  assert.throws(() => buildSearchEntry({
    person, channelGroup, existingSearches: [], values: values({ excluded: "0" })
  }), /之和必须等于/);
  assert.throws(() => buildSearchEntry({
    person, channelGroup, existingSearches: [], values: values({ stoppingRuleMet: false })
  }), /completed 必须/);
});

test("空选项不会把下一个参数名误当作值", () => {
  assert.equal(option(["--accepted", "--scope", "测试范围"], "--accepted"), null);
  assert.equal(option(["--scope", "测试范围"], "--scope"), "测试范围");
});
