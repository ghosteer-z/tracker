const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = path.join(__dirname, "..", "data");
const allowedInterviewTypes = new Set(["one_on_one", "group_conversation"]);
const allowedSourceTypes = new Set(["transcript", "video", "audio"]);
const allowedChannelTypes = new Set(["video_library", "youtube", "podcast_archive", "official_archive"]);
const allowedSearchStatuses = new Set(["partial", "completed", "blocked"]);
const allowedSearchTypes = new Set(["trusted_channel", "broad_web"]);
const allowedSourceRoles = new Set(["subject_official", "interview_media", "program_producer", "event_organizer"]);
const errors = [];

function readJson(filename) {
  const filePath = path.join(dataDirectory, filename);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`无法读取 ${filePath}: ${error.message}`);
    process.exit(1);
  }
}

function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function isUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalize(value) {
  return String(value || "")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s·・:：,，.。!！?？《》【】()[\]（）_-]/g, "");
}

function requireString(record, field, label) {
  if (typeof record[field] !== "string" || record[field].trim() === "") {
    errors.push(`${label}: ${field} 必须是非空文字`);
  }
}

function checkId(id, label) {
  if (typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    errors.push(`${label}: id 只允许小写英文字母、数字和连字符`);
  }
}

function checkUniqueId(id, seen, label) {
  if (seen.has(id)) errors.push(`${label}: id 与 ${seen.get(id)} 重复`);
  else seen.set(id, label);
}

const interviewData = readJson("interviews.json");
const peopleData = readJson("people.json");
const channelData = readJson("channels.json");
const searchData = readJson("search-log.json");
const dedupData = readJson("dedup-log.json");

for (const [name, data, listField, schemaVersion] of [
  ["interviews.json", interviewData, "interviews", 1],
  ["people.json", peopleData, "people", 1],
  ["channels.json", channelData, "people", 1],
  ["search-log.json", searchData, "searches", 2],
  ["dedup-log.json", dedupData, "entries", 1]
]) {
  if (data.schema_version !== schemaVersion) errors.push(`${name}: schema_version 必须是 ${schemaVersion}`);
  if (!Array.isArray(data[listField])) errors.push(`${name}: ${listField} 必须是数组`);
}

const personIds = new Map();
const personNames = new Map();
for (const [index, person] of (peopleData.people || []).entries()) {
  const label = `人物第 ${index + 1} 条${person.id ? ` (${person.id})` : ""}`;
  for (const field of ["id", "name"]) requireString(person, field, label);
  checkId(person.id, label);
  checkUniqueId(person.id, personIds, label);
  if (personNames.has(person.name)) errors.push(`${label}: name 与 ${personNames.get(person.name)} 重复`);
  else personNames.set(person.name, label);
  if (!Array.isArray(person.aliases)) {
    errors.push(`${label}: aliases 必须是数组`);
  } else if (person.aliases.some(alias => typeof alias !== "string" || alias.trim() === "")) {
    errors.push(`${label}: aliases 中的每一项都必须是非空文字`);
  }
}

const interviewIds = new Map();
const interviewsById = new Map();
const sourceUrls = new Map();
const eventSignatures = new Map();

  for (const [index, record] of (interviewData.interviews || []).entries()) {
  const label = `访谈第 ${index + 1} 条${record.id ? ` (${record.id})` : ""}`;
  for (const field of ["id", "person_id", "title", "program", "published_date"]) requireString(record, field, label);
  checkId(record.id, label);
  checkUniqueId(record.id, interviewIds, label);
  interviewsById.set(record.id, record);
  if (!personIds.has(record.person_id)) errors.push(`${label}: person_id 找不到对应人物`);

  if (!allowedInterviewTypes.has(record.interview_type)) {
    errors.push(`${label}: interview_type 只能是 one_on_one 或 group_conversation`);
  }
  if (!Array.isArray(record.other_participants)) errors.push(`${label}: other_participants 必须是数组`);
  if (!isDate(record.published_date)) errors.push(`${label}: published_date 必须是有效的 YYYY-MM-DD 日期`);
  if (record.event_date !== null && !isDate(record.event_date)) {
    errors.push(`${label}: event_date 不知道时填 null，否则必须是有效的 YYYY-MM-DD 日期`);
  }
  if (!Array.isArray(record.topics)) errors.push(`${label}: topics 必须是数组`);

  const source = record.source;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    errors.push(`${label}: source 必须是一个来源对象`);
    continue;
  }
  if (!allowedSourceTypes.has(source.type)) {
    errors.push(`${label}: source.type 只能是 transcript、video 或 audio`);
  }
  for (const field of ["url", "publisher", "language"]) requireString(source, field, `${label}.source`);
  if (source.channel_id !== null && (typeof source.channel_id !== "string" || source.channel_id.trim() === "")) {
    errors.push(`${label}: source.channel_id 必须是非空文字或 null`);
  }
  if (!isUrl(source.url)) errors.push(`${label}: source.url 必须是有效的 http(s) 链接`);
  if (sourceUrls.has(source.url)) errors.push(`${label}: 来源链接与 ${sourceUrls.get(source.url)} 重复`);
  else sourceUrls.set(source.url, label);

  const effectiveDate = record.event_date || record.published_date;
  const signature = [record.person_id, record.program, effectiveDate].map(normalize).join("|");
  if (eventSignatures.has(signature)) errors.push(`${label}: 与 ${eventSignatures.get(signature)} 疑似为同一场访谈`);
  else eventSignatures.set(signature, label);
}

const channelGroupPersonIds = new Map();
const channelsByPerson = new Map();
let channelCount = 0;

for (const [groupIndex, group] of (channelData.people || []).entries()) {
  const groupLabel = `来源组第 ${groupIndex + 1} 条${group.person_id ? ` (${group.person_id})` : ""}`;
  requireString(group, "person_id", groupLabel);
  if (!personIds.has(group.person_id)) errors.push(`${groupLabel}: person_id 找不到对应人物`);
  checkUniqueId(group.person_id, channelGroupPersonIds, groupLabel);
  if (!Array.isArray(group.channels)) {
    errors.push(`${groupLabel}: channels 必须是数组`);
    continue;
  }

  const channelIds = new Map();
  const channelUrls = new Map();
  channelsByPerson.set(group.person_id, channelIds);

  for (const [channelIndex, channel] of group.channels.entries()) {
    channelCount += 1;
    const label = `${groupLabel}的来源第 ${channelIndex + 1} 条${channel.id ? ` (${channel.id})` : ""}`;
    for (const field of ["id", "name", "url", "owner", "source_role", "content", "search_method", "access_notes"]) {
      requireString(channel, field, label);
    }
    checkId(channel.id, label);
    checkUniqueId(channel.id, channelIds, label);
    if (!allowedChannelTypes.has(channel.type)) errors.push(`${label}: 不支持的渠道类型 ${channel.type}`);
    if (!allowedSourceRoles.has(channel.source_role)) errors.push(`${label}: 不支持的来源角色 ${channel.source_role}`);
    if (!isUrl(channel.url)) errors.push(`${label}: url 必须是有效的 http(s) 链接`);
    if (channelUrls.has(channel.url)) errors.push(`${label}: url 与 ${channelUrls.get(channel.url)} 重复`);
    else channelUrls.set(channel.url, label);
  }
}

for (const personId of personIds.keys()) {
  if (!channelGroupPersonIds.has(personId)) errors.push(`channels.json: 缺少人物来源组 ${personId}`);
}

for (const [index, record] of (interviewData.interviews || []).entries()) {
  const label = `访谈第 ${index + 1} 条 (${record.id})`;
  if (record.source?.channel_id && !channelsByPerson.get(record.person_id)?.has(record.source.channel_id)) {
    errors.push(`${label}: source.channel_id 不属于该人物的一手来源清单`);
  }
}

const searchIds = new Map();
for (const [index, search] of (searchData.searches || []).entries()) {
  const label = `检索第 ${index + 1} 条${search.id ? ` (${search.id})` : ""}`;
  for (const field of ["id", "person_id", "search_type", "checked_at", "scope", "next_step", "notes"]) {
    requireString(search, field, label);
  }
  checkId(search.id, label);
  checkUniqueId(search.id, searchIds, label);
  if (!personIds.has(search.person_id)) errors.push(`${label}: person_id 找不到对应人物`);
  if (!allowedSearchTypes.has(search.search_type)) {
    errors.push(`${label}: search_type 只能是 trusted_channel 或 broad_web`);
  }
  if (search.search_type === "trusted_channel") {
    if (typeof search.channel_id !== "string" || !channelsByPerson.get(search.person_id)?.has(search.channel_id)) {
      errors.push(`${label}: 可信来源检索必须填写属于本次检索人物的 channel_id`);
    }
  } else if (search.channel_id !== null) {
    errors.push(`${label}: 全网补充检索的 channel_id 必须是 null`);
  }
  if (!Array.isArray(search.platforms) || search.platforms.some(item => typeof item !== "string" || item.trim() === "")) {
    errors.push(`${label}: platforms 必须是文字数组`);
  } else if (search.search_type === "broad_web" && search.platforms.length === 0) {
    errors.push(`${label}: 全网补充检索必须写明检查过的平台`);
  }
  if (!Array.isArray(search.queries) || search.queries.length === 0 || search.queries.some(item => typeof item !== "string" || item.trim() === "")) {
    errors.push(`${label}: queries 必须是至少包含一项的文字数组`);
  }
  if (search.date_range !== null) {
    const range = search.date_range;
    if (!range || typeof range !== "object" || Array.isArray(range) || !isDate(range.from) || !isDate(range.to)) {
      errors.push(`${label}: date_range 必须是 null 或包含有效 from、to 日期的对象`);
    } else if (range.from > range.to) {
      errors.push(`${label}: date_range.from 不能晚于 date_range.to`);
    }
  }
  if (!isDate(search.checked_at)) errors.push(`${label}: checked_at 必须是有效的 YYYY-MM-DD 日期`);
  if (!allowedSearchStatuses.has(search.status)) errors.push(`${label}: status 只能是 partial、completed 或 blocked`);
  const counts = search.counts;
  const countFields = ["reviewed_results", "candidates_found", "added_new", "merged_duplicates", "excluded"];
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
    errors.push(`${label}: counts 必须是数量统计对象`);
  } else {
    for (const field of countFields) {
      if (!Number.isInteger(counts[field]) || counts[field] < 0) errors.push(`${label}: counts.${field} 必须是非负整数`);
    }
    if (countFields.every(field => Number.isInteger(counts[field]) && counts[field] >= 0)) {
      if (counts.candidates_found > counts.reviewed_results) {
        errors.push(`${label}: candidates_found 不能超过 reviewed_results`);
      }
      if (counts.added_new + counts.merged_duplicates + counts.excluded !== counts.candidates_found) {
        errors.push(`${label}: 新增、合并与排除数量之和必须等于 candidates_found`);
      }
    }
  }
  if (!Array.isArray(search.accepted_interview_ids)) {
    errors.push(`${label}: accepted_interview_ids 必须是数组`);
  } else {
    for (const id of search.accepted_interview_ids) {
      if (!interviewIds.has(id)) errors.push(`${label}: 找不到已收录访谈 ${id}`);
      else if (interviewsById.get(id).person_id !== search.person_id) {
        errors.push(`${label}: 已收录访谈 ${id} 不属于本次检索人物`);
      }
    }
    if (counts && Number.isInteger(counts.added_new) && Number.isInteger(counts.merged_duplicates)
      && search.accepted_interview_ids.length > counts.added_new + counts.merged_duplicates) {
      errors.push(`${label}: accepted_interview_ids 数量不能超过新增与合并数量之和`);
    }
  }
}

const allowedDedupActions = new Set(["excluded", "added_new", "replaced_source", "kept_existing"]);
const dedupIds = new Map();
for (const [index, entry] of (dedupData.entries || []).entries()) {
  const label = `去重日志第 ${index + 1} 条${entry.id ? ` (${entry.id})` : ""}`;
  for (const field of ["id", "processed_at", "action"]) requireString(entry, field, label);
  checkUniqueId(entry.id, dedupIds, label);
  if (Number.isNaN(new Date(entry.processed_at).valueOf())) errors.push(`${label}: processed_at 必须是有效时间`);
  if (!allowedDedupActions.has(entry.action)) errors.push(`${label}: 不支持的 action ${entry.action}`);
  if (entry.candidate_url !== null && !isUrl(entry.candidate_url)) errors.push(`${label}: candidate_url 必须是有效链接或 null`);
  if (!Array.isArray(entry.reasons) || entry.reasons.length === 0) errors.push(`${label}: reasons 必须是非空数组`);
  if (typeof entry.confidence !== "number" || entry.confidence < 0 || entry.confidence > 1) {
    errors.push(`${label}: confidence 必须是0到1之间的数字`);
  }
  if (entry.action !== "excluded" && !interviewIds.has(entry.matched_interview_id)) {
    errors.push(`${label}: matched_interview_id 找不到对应访谈`);
  }
}

if (errors.length) {
  console.error(`校验失败，共 ${errors.length} 个问题：`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `校验通过：${peopleData.people.length} 个人物，${interviewData.interviews.length} 场访谈，${channelCount} 个一手来源，${searchData.searches.length} 条检索记录，${dedupData.entries.length} 条去重日志。`
);
