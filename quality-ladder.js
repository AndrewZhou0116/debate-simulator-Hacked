/**
 * Quality Ladder: default 4o-mini, validate, repair once with 4o-mini, upgrade to Opus only when necessary.
 * Token budget and repair params from debate-config.js (QUALITY_LADDER_BUDGETS, QUALITY_LADDER_REPAIR).
 */
import {
  QUALITY_LADDER_BUDGETS,
  QUALITY_LADDER_EXACT_SENTENCE_CAP,
  QUALITY_LADDER_REPAIR
} from "./debate-config.js";

/** Map roleSubType to stage key for budget. */
function getStageKey(segment) {
  const roleType = segment?.roleType || "debater";
  const sub = segment?.roleSubType || "";
  if (roleType === "chair") return "chair_procedural";
  if (sub === "interjection") return "interjection";
  if (sub === "pro_statement" || sub === "con_statement") return "opening_statement";
  if (sub === "pro_rebuttal" || sub === "con_rebuttal") return "rebuttal";
  if (sub === "pro_summary" || sub === "con_summary") return "closing";
  return "rebuttal";
}

/**
 * Token budget for one segment. Used by Quality Ladder.
 * @param {string} stage - one of transition, chair_procedural, interjection, opening_statement, rebuttal, crossfire, closing, conclusion
 * @param {number} strictness - 0..10
 * @param {string} quality_mode - "draft" | "show" | "final"
 * @param {{ exact_sentence_count?: boolean }} [opts]
 * @returns {{ max_tokens: number, temperature: number }}
 */
export function segmentBudget(stage, strictness = 0, quality_mode = "show", opts = {}) {
  const range = QUALITY_LADDER_BUDGETS[stage] || QUALITY_LADDER_BUDGETS.rebuttal;
  let max_tokens = Math.round((range.min + range.max) / 2);
  if (quality_mode === "final") max_tokens = Math.round(max_tokens * 1.1);
  if (strictness >= 7) max_tokens = Math.round(max_tokens * 0.95);
  max_tokens = Math.max(range.min, Math.min(range.max, max_tokens));
  if (opts.exact_sentence_count) {
    max_tokens = Math.min(max_tokens, QUALITY_LADDER_EXACT_SENTENCE_CAP);
  }
  let temperature = 0.55;
  if (opts.exact_sentence_count || strictness >= 6) temperature = 0.45;
  else if (quality_mode === "final") temperature = 0.5;
  if (strictness >= 8) temperature = 0.4;
  return { max_tokens, temperature };
}

/**
 * Build validator contract for this segment (for validateOutput).
 * Caller passes forbidden phrases, banned stems, speaker banlist from prompts.
 */
export function buildValidatorContract(segment, context = {}, options = {}) {
  const roleType = segment?.roleType || "debater";
  const sub = segment?.roleSubType || "";
  const exactSentences = sub === "interjection" || sub === "closingChair" ? 1 : (options.exactSentences ?? null);
  const minSentences = options.minSentences ?? (roleType === "chair" ? 1 : 1);
  const maxSentences = options.maxSentences ?? (roleType === "chair" ? 2 : 6);
  const maxQuestions = options.maxQuestions ?? 1;
  const mustHook = options.mustHook ?? /rebuttal|summary|statement/.test(sub);
  const opponentLine = (context.previousOpponentText || "").trim().slice(0, 600);
  return {
    exactSentences: exactSentences ?? undefined,
    minSentences: exactSentences == null ? minSentences : undefined,
    maxSentences: exactSentences == null ? maxSentences : exactSentences,
    maxQuestions,
    mustHook: mustHook && opponentLine.length > 0,
    opponentLine: opponentLine || undefined,
    forbiddenPhrases: options.forbiddenPhrases || [],
    bannedStems: options.bannedStems || [],
    bannedWordsSpeaker: options.bannedWordsSpeaker || [],
    englishOnly: true,
    noStageDirections: true
  };
}

/**
 * Build repair prompt: contract + opponent line + failure list. Model outputs only the fixed speech.
 */
export function buildRepairPrompt(contract, opponentLine, failures, currentText) {
  const failLines = failures.map((f) => `- ${f.rule}: ${f.detail || ""}`).join("\n");
  return `You are fixing a debate turn that failed validation. Output ONLY the corrected speech text. No explanation, no labels.

CONTRACT (must all be satisfied):
- Sentence count: ${contract.exactSentences != null ? `EXACTLY ${contract.exactSentences}` : `between ${contract.minSentences} and ${contract.maxSentences}`} sentence(s).
- At most ${contract.maxQuestions} question mark(s).
- First sentence must hook to the opponent's line (quote, paraphrase, or use a key word from it).
- Do not use any of the forbidden phrases or speaker-banned words already listed.
- English only. No stage directions or labels.

Opponent's last line (hook target):
"""
${(opponentLine || "").slice(0, 400)}
"""

FAILURES TO FIX:
${failLines}

Current (rejected) draft:
"""
${(currentText || "").slice(0, 800)}
"""

Output ONLY the repaired speech.`;
}

/** Repair pass params (4o-mini, low temp). */
export function getRepairParams() {
  return {
    max_tokens: QUALITY_LADDER_REPAIR.max_tokens,
    temperature: (QUALITY_LADDER_REPAIR.temperature_min + QUALITY_LADDER_REPAIR.temperature_max) / 2
  };
}

/** Should we upgrade to Opus for this segment before trying? (high visibility or very high strictness) */
export function shouldUpgradeImmediately(segment, context = {}, strictness = 0) {
  const sub = segment?.roleSubType || "";
  const quality_mode = context.streamMode ? "show" : (context.detailMode ? "final" : "draft");
  if (quality_mode === "final") return true;
  if (/conclusion|closingChair|pro_summary|con_summary/.test(sub)) return true;
  if (strictness >= 8) return true;
  return false;
}

/** Get stage key from segment for segmentBudget. */
export function getStageKeyForSegment(segment) {
  return getStageKey(segment);
}
