const fs = require("node:fs");
const path = require("node:path");
const { processCandidate, validateCandidateShape } = require("./dedup-core");

const root = path.join(__dirname, "..");
const candidatePath = process.argv[2];

if (!candidatePath) {
  console.error("用法：npm run import -- <候选访谈.json>");
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
const interviewData = readJson(interviewsPath);
const channelData = readJson(channelsPath);
const logData = readJson(logPath);
const candidate = readJson(path.resolve(candidatePath));
const peopleData = readJson(path.join(root, "data", "people.json"));
const shapeErrors = validateCandidateShape(candidate, new Set(peopleData.people.map(person => person.id)));
if (shapeErrors.length) {
  console.error("候选访谈格式错误，正式数据未改动：");
  for (const error of shapeErrors) console.error(`- ${error}`);
  process.exit(1);
}
const channelsByPerson = new Map(
  channelData.people.map(group => [group.person_id, new Set(group.channels.map(channel => channel.id))])
);

const result = processCandidate(
  { interviews: interviewData.interviews, channelsByPerson },
  candidate
);

const logEntry = {
  id: `dedup-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  processed_at: new Date().toISOString(),
  ...result.entry
};

writeJson(interviewsPath, { ...interviewData, interviews: result.interviews });
writeJson(logPath, { ...logData, entries: [...logData.entries, logEntry] });

console.log(`${logEntry.action}: ${logEntry.matched_interview_id || "未收录"}`);
for (const reason of logEntry.reasons) console.log(`- ${reason}`);
