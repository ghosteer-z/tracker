const fs = require("node:fs");
const path = require("node:path");
const { buildPlan } = require("./generate-search-plan");

const root = path.join(__dirname, "..");

function integer(value, name) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 0) throw new Error(`${name} 必须是非负整数`);
  return result;
}

function list(value) {
  return value ? value.split(",").map(item => item.trim()).filter(Boolean) : [];
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildSearchEntry({ person, channelGroup, existingSearches, values }) {
  const channelId = values.channel || null;
  const broadWeb = values.broadWeb === true;
  if ((channelId ? 1 : 0) + (broadWeb ? 1 : 0) !== 1) {
    throw new Error("必须且只能选择 --channel <id> 或 --broad-web");
  }
  const channel = channelId ? channelGroup.channels.find(item => item.id === channelId) : null;
  if (channelId && !channel) throw new Error(`找不到渠道：${channelId}`);

  const checkedAt = values.checkedAt || new Date().toISOString().slice(0, 10);
  const plan = buildPlan(person, channelGroup, { from: values.from, to: values.to });
  const planned = broadWeb ? plan.broad_web : plan.trusted_channels.find(item => item.channel_id === channelId);
  const counts = {
    reviewed_results: integer(values.reviewed, "reviewed"),
    candidates_found: integer(values.candidates, "candidates"),
    added_new: integer(values.added, "added"),
    merged_duplicates: integer(values.merged, "merged"),
    excluded: integer(values.excluded, "excluded")
  };
  if (counts.candidates_found > counts.reviewed_results) throw new Error("candidates 不能超过 reviewed");
  if (counts.added_new + counts.merged_duplicates + counts.excluded !== counts.candidates_found) {
    throw new Error("added、merged 与 excluded 之和必须等于 candidates");
  }
  if (values.status === "completed" && (!values.queriesComplete || !values.stoppingRuleMet)) {
    throw new Error("completed 必须同时提供 --queries-complete 和 --stopping-rule-met");
  }
  const platforms = list(values.platforms);
  if (broadWeb && platforms.length === 0) throw new Error("全网搜索必须通过 --platforms 写明平台");
  const methods = list(values.methods);
  if (methods.length === 0) throw new Error("必须通过 --methods 写明实际搜索方法");
  if (!new Set(["partial", "completed", "blocked"]).has(values.status)) {
    throw new Error("status 只能是 partial、completed 或 blocked");
  }
  if ((values.from && !values.to) || (!values.from && values.to)) {
    throw new Error("from 和 to 必须同时填写或同时省略");
  }
  if (!values.scope || !values.nextStep || !values.notes) {
    throw new Error("scope、next-step 和 notes 都必须填写");
  }

  const prefix = `${person.id}-${broadWeb ? "broad-web" : channelId}-${checkedAt}`;
  let id = prefix;
  let suffix = 2;
  const ids = new Set(existingSearches.map(item => item.id));
  while (ids.has(id)) id = `${prefix}-${suffix++}`;

  const entry = {
    id: slug(id),
    person_id: person.id,
    search_type: broadWeb ? "broad_web" : "trusted_channel",
    channel_id: channelId,
    platforms,
    checked_at: checkedAt,
    queries: planned.queries,
    date_range: values.from || values.to ? { from: values.from, to: values.to } : null,
    scope: values.scope,
    status: values.status,
    counts,
    accepted_interview_ids: list(values.accepted),
    next_step: values.nextStep,
    notes: values.notes
  };
  if (values.status === "completed") {
    entry.completion_check = {
      planned_queries_executed: true,
      stopping_rule_met: true,
      methods_used: methods
    };
  }
  return entry;
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

function main() {
  const args = process.argv.slice(2);
  const data = filename => JSON.parse(fs.readFileSync(path.join(root, "data", filename), "utf8"));
  const peopleData = data("people.json");
  const channelsData = data("channels.json");
  const searchData = data("search-log.json");
  const personId = option(args, "--person");
  const person = peopleData.people.find(item => item.id === personId);
  const channelGroup = channelsData.people.find(item => item.person_id === personId);
  if (!person || !channelGroup) {
    console.error("用法：npm run search-log -- --person <id> (--channel <id> | --broad-web) --status <状态> --reviewed <数> --candidates <数> --added <数> --merged <数> --excluded <数> --methods <逗号列表> --scope <范围> --next-step <下一步> --notes <备注> [--append]");
    process.exit(1);
  }

  let entry;
  try {
    entry = buildSearchEntry({
      person,
      channelGroup,
      existingSearches: searchData.searches,
      values: {
        channel: option(args, "--channel"),
        broadWeb: args.includes("--broad-web"),
        checkedAt: option(args, "--checked-at"),
        from: option(args, "--from") || person.tracking_from || "2025-01-01",
        to: option(args, "--to"),
        status: option(args, "--status"),
        reviewed: option(args, "--reviewed"),
        candidates: option(args, "--candidates"),
        added: option(args, "--added"),
        merged: option(args, "--merged"),
        excluded: option(args, "--excluded"),
        platforms: option(args, "--platforms"),
        methods: option(args, "--methods"),
        accepted: option(args, "--accepted"),
        scope: option(args, "--scope"),
        nextStep: option(args, "--next-step"),
        notes: option(args, "--notes"),
        queriesComplete: args.includes("--queries-complete"),
        stoppingRuleMet: args.includes("--stopping-rule-met")
      }
    });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  if (args.includes("--append")) {
    fs.writeFileSync(path.join(root, "data", "search-log.json"), `${JSON.stringify({
      ...searchData,
      searches: [...searchData.searches, entry]
    }, null, 2)}\n`, "utf8");
    console.log(`已追加检索记录：${entry.id}`);
  } else {
    process.stdout.write(`${JSON.stringify(entry, null, 2)}\n`);
  }
}

if (require.main === module) main();

module.exports = { buildSearchEntry, option };
