/**
 * Segment output validator: hard constraints only. No LLM.
 * Used by Quality Ladder to decide pass / repair / upgrade.
 */

/** Robust sentence split: treat . ! ? as delimiters, avoid splitting on abbreviations (e.g. "Dr. X", "U.S."). */
function splitSentences(text) {
  if (!text || typeof text !== "string") return [];
  const t = text.trim();
  if (!t) return [];
  // Replace common abbreviations with placeholder so we don't split on them
  const noAbbrev = t
    .replace(/\b(Dr|Mr|Mrs|Ms|Prof|Sr|Jr|vs|e\.g|i\.e|U\.S|U\.K|etc)\.\s/gi, (m) => m.replace(".", "\u0001"))
    .replace(/\b(\d+)\.\s/g, (m) => m.replace(".", "\u0001"));
  const raw = (noAbbrev.match(/[^.!?]*[.!?]+/g) || []).map((s) => s.trim()).filter(Boolean);
  return raw.map((s) => s.replace(/\u0001/g, "."));
}

function countSentences(text) {
  return splitSentences(text).length;
}

function countQuestions(text) {
  if (!text || typeof text !== "string") return 0;
  return (text.match(/\?/g) || []).length;
}

/** Check for forbidden phrases (case-insensitive, whole-phrase or stem). */
function containsForbidden(text, forbiddenList = []) {
  if (!text || !Array.isArray(forbiddenList) || forbiddenList.length === 0) return null;
  const lower = text.toLowerCase();
  for (const phrase of forbiddenList) {
    const p = String(phrase).toLowerCase().trim();
    if (!p) continue;
    const asWord = p.split(/\s+/).length === 1 ? new RegExp("\\b" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i") : new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    if (asWord.test(text)) return phrase;
  }
  return null;
}

/** Check for banned stems (regex list). */
function containsBannedStem(text, stemRegexes = []) {
  if (!text || !Array.isArray(stemRegexes)) return null;
  for (const re of stemRegexes) {
    if (re.test(text)) return String(re).slice(0, 50);
  }
  return null;
}

/** Simple hook check: first sentence or full text should share a meaningful word with opponent line (or explicit quote). */
function hasHookToOpponent(text, opponentLine = "") {
  const opp = (opponentLine || "").trim();
  if (!opp) return true;
  const t = (text || "").trim();
  if (!t) return false;
  const firstSentence = splitSentences(t)[0] || t;
  const quoteMatch = /["']([^"']{10,80})["']/.exec(t);
  if (quoteMatch && opp.toLowerCase().includes(quoteMatch[1].toLowerCase().slice(0, 20))) return true;
  const oppWords = new Set(opp.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const firstWords = firstSentence.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const overlap = firstWords.filter((w) => oppWords.has(w));
  if (overlap.length >= 1) return true;
  const allWords = t.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const anyOverlap = allWords.filter((w) => oppWords.has(w));
  return anyOverlap.length >= 2;
}

/** Detect heavy non-English (e.g. many CJK). */
function isMostlyEnglish(text) {
  if (!text || typeof text !== "string") return true;
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  const letters = (text.match(/[a-zA-Z]/g) || []).length;
  return letters >= 10 && cjk <= letters / 2;
}

/** Stage directions / labels: common patterns. */
function hasStageDirections(text) {
  if (!text || typeof text !== "string") return false;
  const t = text.trim();
  if (/^\[.*\]\s*$/s.test(t)) return true;
  if (/^\(.*\)\s*$/s.test(t) && t.length < 100) return true;
  if (/^(Speaker|Chair|Narrator|Stage|Aside):/im.test(t)) return true;
  if (/\*\*.*\*\*:\s*/.test(t) && /^(Aristotle|Lacan|Turing|Marx|Makima|Trump|Light|Kant|Gus|Camus|Newton)/i.test(t)) return true;
  return false;
}

/**
 * Validate segment output against contract.
 * @param {string} text - Raw model output
 * @param {{
 *   exactSentences?: number,
 *   minSentences?: number,
 *   maxSentences?: number,
 *   maxQuestions?: number,
 *   mustHook?: boolean,
 *   opponentLine?: string,
 *   forbiddenPhrases?: string[],
 *   bannedStems?: RegExp[],
 *   bannedWordsSpeaker?: string[],
 *   englishOnly?: boolean,
 *   noStageDirections?: boolean
 * }} contract
 * @returns {{ pass: boolean, failures: Array<{ rule: string, detail?: string }> }}
 */
export function validateOutput(text, contract = {}) {
  const failures = [];
  const t = (text || "").trim();
  if (!t) {
    return { pass: false, failures: [{ rule: "non_empty", detail: "empty output" }] };
  }

  const sentences = splitSentences(t);
  const nSent = sentences.length;
  const nQ = countQuestions(t);

  if (contract.exactSentences != null) {
    if (nSent !== contract.exactSentences) {
      failures.push({ rule: "sentence_count", detail: `expected exactly ${contract.exactSentences}, got ${nSent}` });
    }
  } else {
    if (contract.minSentences != null && nSent < contract.minSentences) {
      failures.push({ rule: "sentence_count", detail: `min ${contract.minSentences}, got ${nSent}` });
    }
    if (contract.maxSentences != null && nSent > contract.maxSentences) {
      failures.push({ rule: "sentence_count", detail: `max ${contract.maxSentences}, got ${nSent}` });
    }
  }

  if (contract.maxQuestions != null && nQ > contract.maxQuestions) {
    failures.push({ rule: "question_count", detail: `max ${contract.maxQuestions}, got ${nQ}` });
  }

  if (contract.mustHook && contract.opponentLine != null) {
    if (!hasHookToOpponent(t, contract.opponentLine)) {
      failures.push({ rule: "hook", detail: "first sentence or text does not hook to opponent line" });
    }
  }

  const forbidden = contract.forbiddenPhrases || [];
  const foundForbidden = containsForbidden(t, forbidden);
  if (foundForbidden) {
    failures.push({ rule: "forbidden_phrase", detail: `"${foundForbidden}"` });
  }

  const bannedStems = contract.bannedStems || [];
  const foundStem = containsBannedStem(t, bannedStems);
  if (foundStem) {
    failures.push({ rule: "banned_stem", detail: foundStem });
  }

  const speakerBanned = contract.bannedWordsSpeaker || [];
  const foundSpeaker = containsForbidden(t, speakerBanned);
  if (foundSpeaker) {
    failures.push({ rule: "speaker_banned_word", detail: `"${foundSpeaker}"` });
  }

  if (contract.englishOnly !== false && !isMostlyEnglish(t)) {
    failures.push({ rule: "english_only", detail: "output contains heavy non-English text" });
  }

  if (contract.noStageDirections !== false && hasStageDirections(t)) {
    failures.push({ rule: "no_stage_directions", detail: "labels or stage directions detected" });
  }

  return {
    pass: failures.length === 0,
    failures,
    meta: { sentenceCount: nSent, questionCount: nQ }
  };
}

export { splitSentences, countSentences, countQuestions, hasHookToOpponent };
