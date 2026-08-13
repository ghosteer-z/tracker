const fs = require("node:fs");
const path = require("node:path");
const { processCandidate, sourceIdentity, validateCandidateShape } = require("./dedup-core");

const root = path.join(__dirname, "..");
const args = process.argv.slice(2);
const candidatePath = args.find(arg => !arg.startsWith("--"));
const forceNew = args.includes("--force-new");
const reconsider = args.includes("--reconsider");
const mergeIndex = args.indexOf("--merge-with");
const mergeWith = mergeIndex >= 0 ? args[mergeIndex + 1] : null;

if (!candidatePath) {
  console.error("用法：npm run import -- <候选访谈.json> [--force-new | --merge-with <访谈id>]");
  process.exit(1);
}
if (forceNew && mergeWith) {
  console.error("--force-new 和 --merge-with 不能同时使用");
  process.exit(1);
}
if (mergeIndex >= 0 && !mergeWith) {
  console.error("--merge-with 后必须填写访谈id");
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const interviewsPath = path.join(root, "data", "interviews.json");
const channelsPath = path.join(root, "data", "channels.json");
const logPath = path.join(root, "data", "dedup-log.json");
const reviewedCandidatesPath = path.join(root, "data", "reviewed-candidates.json");
const interviewData = readJson(interviewsPath);
const channelData = readJson(channelsPath);
const logData = readJson(logPath);
const reviewedCandidatesData = readJson(reviewedCandidatesPath);
const candidate = readJson(path.resolve(candidatePath));
const peopleData = readJson(path.join(root, "data", "people.json"));
const shapeErrors = validateCandidateShape(candidate, new Set(peopleData.people.map(person => person.id)));
if (shapeErrors.length) {
  console.error("候选访谈格式错误，正式数据未改动：");
  for (const error of shapeErrors) console.error(`- ${error}`);
  process.exit(1);
}
const previousReview = reviewedCandidatesData.entries.find(entry =>
  entry.person_id === candidate.person_id
  && sourceIdentity(entry.url) === sourceIdentity(candidate.source.url)
);
if (previousReview && !reconsider) {
  console.error(`该链接已于 ${previousReview.reviewed_at} 被排除，正式数据未改动：`);
  for (const reason of previousReview.reasons) console.error(`- ${reason}`);
  console.error("确认需要重新判断时，请增加 --reconsider");
  process.exit(2);
}
const channelsByPerson = new Map(
  channelData.people.map(group => [group.person_id, new Set(group.channels.map(channel => channel.id))])
);

let result;
try {
  result = processCandidate(
    { interviews: interviewData.interviews, channelsByPerson },
    candidate,
    { forceNew, mergeWith }
  );
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const logEntry = {
  id: `dedup-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  processed_at: new Date().toISOString(),
  ...result.entry
};

if (result.entry.action === "needs_review") {
  console.error(`needs_review: 可能与 ${result.entry.matched_interview_id} 重复，正式数据未改动`);
  for (const reason of result.entry.reasons) console.error(`- ${reason}`);
  console.error("请复核后使用 --force-new 或 --merge-with <访谈id> 重新导入");
  process.exit(2);
}

writeJson(interviewsPath, { ...interviewData, interviews: result.interviews });
writeJson(logPath, { ...logData, entries: [...logData.entries, logEntry] });
const retainedReviews = previousReview && reconsider
  ? reviewedCandidatesData.entries.filter(entry => entry.id !== previousReview.id)
  : reviewedCandidatesData.entries;
if (result.entry.action === "excluded") {
  const reasonCodes = [];
  if (candidate.screening.is_primary !== true) reasonCodes.push("not_primary");
  if (candidate.screening.is_complete !== true) reasonCodes.push("incomplete");
  if (candidate.screening.is_conversation !== true) reasonCodes.push("not_conversation");
  if (candidate.screening.is_excluded_event === true) reasonCodes.push("excluded_event");
  const reviewedEntry = {
    id: `reviewed-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    person_id: candidate.person_id,
    url: candidate.source.url,
    title: candidate.title,
    decision: "excluded",
    reason_codes: reasonCodes,
    reasons: result.entry.reasons,
    reviewed_at: new Date().toISOString().slice(0, 10)
  };
  writeJson(reviewedCandidatesPath, {
    ...reviewedCandidatesData,
    entries: [...retainedReviews, reviewedEntry]
  });
} else if (previousReview && reconsider) {
  writeJson(reviewedCandidatesPath, { ...reviewedCandidatesData, entries: retainedReviews });
}

console.log(`${logEntry.action}: ${logEntry.matched_interview_id || "未收录"}`);
for (const reason of logEntry.reasons) console.log(`- ${reason}`);
