const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(__dirname, "..", "data", "interviews.json");
const allowedInterviewTypes = new Set(["one_on_one", "group_conversation"]);
const allowedSourceTypes = new Set(["transcript", "video", "audio"]);
const errors = [];

function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
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

let data;
try {
  data = JSON.parse(fs.readFileSync(filePath, "utf8"));
} catch (error) {
  console.error(`无法读取 ${filePath}: ${error.message}`);
  process.exit(1);
}

if (data.schema_version !== 1) errors.push("schema_version 必须是 1");
if (!Array.isArray(data.interviews)) errors.push("interviews 必须是数组");

const ids = new Map();
const urls = new Map();
const eventSignatures = new Map();

for (const [index, record] of (data.interviews || []).entries()) {
  const label = `第 ${index + 1} 条${record.id ? ` (${record.id})` : ""}`;

  for (const field of ["id", "person", "title", "program", "published_date"]) {
    requireString(record, field, label);
  }

  if (typeof record.id === "string" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.id)) {
    errors.push(`${label}: id 只允许小写英文字母、数字和连字符`);
  }

  if (ids.has(record.id)) errors.push(`${label}: id 与第 ${ids.get(record.id)} 条重复`);
  else ids.set(record.id, index + 1);

  if (!allowedInterviewTypes.has(record.interview_type)) {
    errors.push(`${label}: interview_type 只能是 one_on_one 或 group_conversation`);
  }
  if (!Array.isArray(record.interviewers)) errors.push(`${label}: interviewers 必须是数组`);
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

  try {
    const url = new URL(source.url);
    if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("unsupported protocol");
  } catch {
    errors.push(`${label}: source.url 必须是有效的 http(s) 链接`);
  }

  if (urls.has(source.url)) errors.push(`${label}: 来源链接与第 ${urls.get(source.url)} 条重复`);
  else urls.set(source.url, index + 1);

  const effectiveDate = record.event_date || record.published_date;
  const signature = [record.person, record.program, effectiveDate].map(normalize).join("|");
  if (eventSignatures.has(signature)) {
    errors.push(`${label}: 与第 ${eventSignatures.get(signature)} 条疑似为同一场访谈`);
  } else {
    eventSignatures.set(signature, index + 1);
  }
}

if (errors.length) {
  console.error(`校验失败，共 ${errors.length} 个问题：`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`校验通过：${data.interviews.length} 场访谈，每场均只有一个完整一手来源。`);
