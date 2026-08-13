const crypto = require("node:crypto");

const SOURCE_RANK = {
  audio: 1,
  video: 2,
  transcript: 3
};

const INTERVIEW_TYPES = new Set(["one_on_one", "group_conversation"]);

function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validateCandidateShape(candidate, knownPersonIds) {
  const errors = [];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return ["候选内容必须是对象"];
  for (const field of ["person_id", "title", "program", "published_date"]) {
    if (typeof candidate[field] !== "string" || candidate[field].trim() === "") errors.push(`${field} 必须是非空文字`);
  }
  if (knownPersonIds && !knownPersonIds.has(candidate.person_id)) errors.push("person_id 找不到对应人物");
  if (!INTERVIEW_TYPES.has(candidate.interview_type)) errors.push("interview_type 不受支持");
  if (!Array.isArray(candidate.other_participants)) errors.push("other_participants 必须是数组");
  if (!Array.isArray(candidate.topics)) errors.push("topics 必须是数组");
  if (!isDate(candidate.published_date)) errors.push("published_date 必须是有效的 YYYY-MM-DD 日期");
  if (candidate.event_date !== null && !isDate(candidate.event_date)) errors.push("event_date 不知道时填 null，否则必须是有效日期");

  if (!candidate.source || typeof candidate.source !== "object" || Array.isArray(candidate.source)) {
    errors.push("source 必须是对象");
  } else {
    if (!(candidate.source.type in SOURCE_RANK)) errors.push("source.type 只能是 transcript、video 或 audio");
    for (const field of ["url", "publisher", "language"]) {
      if (typeof candidate.source[field] !== "string" || candidate.source[field].trim() === "") {
        errors.push(`source.${field} 必须是非空文字`);
      }
    }
    try {
      const url = new URL(candidate.source.url);
      if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("protocol");
    } catch {
      errors.push("source.url 必须是有效的 http(s) 链接");
    }
    if (candidate.source.channel_id !== undefined && candidate.source.channel_id !== null
      && (typeof candidate.source.channel_id !== "string" || candidate.source.channel_id.trim() === "")) {
      errors.push("source.channel_id 必须是非空文字或 null");
    }
  }

  if (!candidate.screening || typeof candidate.screening !== "object" || Array.isArray(candidate.screening)) {
    errors.push("screening 必须是对象");
  } else {
    for (const field of ["is_primary", "is_complete", "is_conversation", "is_excluded_event"]) {
      if (typeof candidate.screening[field] !== "boolean") errors.push(`screening.${field} 必须是布尔值`);
    }
  }
  return errors;
}

function normalize(value) {
  return String(value || "")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s·・:：,，.。!！?？《》【】()[\]（）_'"-]/g, "");
}

function bigrams(value) {
  const text = normalize(value);
  if (text.length < 2) return text ? [text] : [];
  const result = [];
  for (let index = 0; index < text.length - 1; index += 1) result.push(text.slice(index, index + 2));
  return result;
}

function diceSimilarity(left, right) {
  const leftNormalized = normalize(left);
  const rightNormalized = normalize(right);
  if (!leftNormalized || !rightNormalized) return 0;
  if (leftNormalized === rightNormalized) return 1;

  const rightCounts = new Map();
  for (const item of bigrams(rightNormalized)) rightCounts.set(item, (rightCounts.get(item) || 0) + 1);
  let overlap = 0;
  const leftItems = bigrams(leftNormalized);
  for (const item of leftItems) {
    const count = rightCounts.get(item) || 0;
    if (count > 0) {
      overlap += 1;
      rightCounts.set(item, count - 1);
    }
  }
  return (2 * overlap) / (leftItems.length + bigrams(rightNormalized).length);
}

function participantSimilarity(left = [], right = []) {
  const leftSet = new Set(left.map(normalize).filter(Boolean));
  const rightSet = new Set(right.map(normalize).filter(Boolean));
  if (leftSet.size === 0 && rightSet.size === 0) return 0;
  const overlap = [...leftSet].filter(item => rightSet.has(item)).length;
  return overlap / new Set([...leftSet, ...rightSet]).size;
}

function daysBetween(left, right) {
  if (!left || !right) return null;
  return Math.abs((new Date(left) - new Date(right)) / 86400000);
}

function sourceIdentity(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (!new Set(["v", "id"]).has(key)) parsed.searchParams.delete(key);
    }
    parsed.pathname = parsed.pathname.replace(/\/$/, "");
    return parsed.toString();
  } catch {
    return String(url || "");
  }
}

function compareEvents(existing, candidate) {
  if (existing.person_id !== candidate.person_id) return { score: 0, reasons: [] };

  const reasons = ["目标人物相同"];
  if (sourceIdentity(existing.source.url) === sourceIdentity(candidate.source.url)) {
    return { score: 1, reasons: [...reasons, "来源链接相同"] };
  }

  const program = diceSimilarity(existing.program, candidate.program);
  const title = diceSimilarity(existing.title, candidate.title);
  const participants = participantSimilarity(existing.other_participants, candidate.other_participants);
  const eventDatesMatch = Boolean(existing.event_date && candidate.event_date && existing.event_date === candidate.event_date);
  const dateDistance = daysBetween(
    existing.event_date || existing.published_date,
    candidate.event_date || candidate.published_date
  );

  let score = program * 0.35 + title * 0.3 + participants * 0.2;
  if (eventDatesMatch) score += 0.25;
  else if (dateDistance !== null && dateDistance <= 3) score += 0.15;
  else if (dateDistance !== null && dateDistance <= 14) score += 0.1;
  else if (dateDistance !== null && dateDistance <= 45) score += 0.05;

  if (program >= 0.85) reasons.push("节目或活动名称高度相似");
  if (title >= 0.8) reasons.push("标题高度相似");
  if (participants >= 0.5) reasons.push("主要参与者重合");
  if (eventDatesMatch) reasons.push("实际谈话日期相同");
  else if (dateDistance !== null && dateDistance <= 14) reasons.push("发布日期或谈话日期接近");

  const exactProgramAndTitle = normalize(existing.program) === normalize(candidate.program)
    && normalize(existing.title) === normalize(candidate.title);
  if (exactProgramAndTitle) score = Math.max(score, 0.9);
  if (!eventDatesMatch && dateDistance !== null && dateDistance > 90) {
    score = Math.min(score, 0.7);
    reasons.push("时间相隔超过90天，保守地不自动合并");
  }

  return { score: Math.min(score, 1), reasons };
}

function findBestMatch(interviews, candidate) {
  let best = null;
  for (const existing of interviews) {
    const comparison = compareEvents(existing, candidate);
    if (!best || comparison.score > best.score) best = { existing, ...comparison };
  }
  return best;
}

function findDuplicate(interviews, candidate) {
  const best = findBestMatch(interviews, candidate);
  return best && best.score >= 0.85 ? best : null;
}

function isKnownChannel(channelsByPerson, personId, channelId) {
  if (!channelId) return false;
  return channelsByPerson.get(personId)?.has(channelId) || false;
}

function chooseSource(existing, candidate, channelsByPerson) {
  const existingRank = SOURCE_RANK[existing.source.type] || 0;
  const candidateRank = SOURCE_RANK[candidate.source.type] || 0;
  if (candidateRank > existingRank) return { winner: "candidate", reason: "候选来源内容更完整" };
  if (candidateRank < existingRank) return { winner: "existing", reason: "现有来源内容更完整" };

  const existingKnown = isKnownChannel(channelsByPerson, existing.person_id, existing.source.channel_id);
  const candidateKnown = isKnownChannel(channelsByPerson, candidate.person_id, candidate.source.channel_id);
  if (candidateKnown && !existingKnown) return { winner: "candidate", reason: "候选来源已登记在可信来源清单" };
  if (existingKnown && !candidateKnown) return { winner: "existing", reason: "现有来源已登记在可信来源清单" };
  return { winner: "existing", reason: "完整度和可信范围相同，保留稳定的现有来源" };
}

function mergeMetadata(existing, candidate) {
  return {
    ...existing,
    published_date: [existing.published_date, candidate.published_date].filter(Boolean).sort()[0],
    event_date: existing.event_date || candidate.event_date || null,
    other_participants: [...new Set([...(existing.other_participants || []), ...(candidate.other_participants || [])])],
    topics: [...new Set([...(existing.topics || []), ...(candidate.topics || [])])]
  };
}

function generateId(candidate) {
  const date = candidate.event_date || candidate.published_date;
  const digest = crypto.createHash("sha1").update(candidate.source.url).digest("hex").slice(0, 8);
  return `${candidate.person_id}-${date}-${digest}`;
}

function screenCandidate(candidate) {
  const screening = candidate.screening || {};
  const failures = [];
  if (screening.is_primary !== true) failures.push("不是确认的一手原发来源");
  if (screening.is_complete !== true) failures.push("内容不完整");
  if (screening.is_conversation !== true) failures.push("不是谈话型内容");
  if (screening.is_excluded_event === true) failures.push("属于业绩会、新闻发布会或股东会等排除类型");
  return failures;
}

function cleanCandidate(candidate) {
  const result = structuredClone(candidate);
  delete result.screening;
  result.id = result.id || generateId(result);
  if (result.source.channel_id === undefined) result.source.channel_id = null;
  return result;
}

function processCandidate(state, rawCandidate, options = {}) {
  const failures = screenCandidate(rawCandidate);
  const candidateUrl = rawCandidate.source?.url || null;
  if (failures.length) {
    return {
      interviews: state.interviews,
      entry: {
        action: "excluded",
        candidate_url: candidateUrl,
        matched_interview_id: null,
        confidence: 1,
        reasons: failures
      }
    };
  }

  const candidate = cleanCandidate(rawCandidate);
  if (options.forceNew) {
    return {
      interviews: [...state.interviews, candidate],
      entry: {
        action: "added_new",
        candidate_url: candidate.source.url,
        matched_interview_id: candidate.id,
        confidence: 1,
        reasons: ["人工确认作为新访谈收录"]
      }
    };
  }

  let duplicate;
  if (options.mergeWith) {
    const existing = state.interviews.find(item => item.id === options.mergeWith);
    if (!existing) throw new Error(`找不到指定合并访谈 ${options.mergeWith}`);
    const comparison = compareEvents(existing, candidate);
    duplicate = { existing, ...comparison, reasons: [...comparison.reasons, "人工指定合并"] };
  } else {
    const best = findBestMatch(state.interviews, candidate);
    if (best && best.score >= 0.65 && best.score < 0.85) {
      return {
        interviews: state.interviews,
        entry: {
          action: "needs_review",
          candidate_url: candidate.source.url,
          matched_interview_id: best.existing.id,
          confidence: Number(best.score.toFixed(3)),
          reasons: [...best.reasons, "相似度处于人工确认区间，未修改正式数据"]
        }
      };
    }
    duplicate = best && best.score >= 0.85 ? best : null;
  }
  if (!duplicate) {
    return {
      interviews: [...state.interviews, candidate],
      entry: {
        action: "added_new",
        candidate_url: candidate.source.url,
        matched_interview_id: candidate.id,
        confidence: 1 - Number((duplicate?.score || 0).toFixed(3)),
        reasons: ["未发现达到自动合并阈值的已有访谈"]
      }
    };
  }

  const selection = chooseSource(duplicate.existing, candidate, state.channelsByPerson);
  const merged = mergeMetadata(duplicate.existing, candidate);
  if (selection.winner === "candidate") merged.source = candidate.source;
  const interviews = state.interviews.map(item => item.id === duplicate.existing.id ? merged : item);

  return {
    interviews,
    entry: {
      action: selection.winner === "candidate" ? "replaced_source" : "kept_existing",
      candidate_url: candidate.source.url,
      matched_interview_id: duplicate.existing.id,
      confidence: Number(duplicate.score.toFixed(3)),
      reasons: [...duplicate.reasons, selection.reason]
    }
  };
}

module.exports = {
  compareEvents,
  findDuplicate,
  findBestMatch,
  processCandidate,
  chooseSource,
  validateCandidateShape
};
