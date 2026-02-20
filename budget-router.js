/**
 * Budget Router: choose model, max_tokens, temperature per segment to maximize quality per cost.
 * Deterministic (no LLM call). Uses cheap model when risk is low, expensive when strictness/quality demand it.
 */

/** Base max_tokens by segment type (then multipliers apply). */
const BASE_TOKENS = {
  transition: 80,
  definition_request: 80,
  chair_procedural: 80,
  interjection: 120,
  opening_statement: 220,
  rebuttal: 260,
  crossfire: 260,
  closing: 520,
  conclusion: 520
};

/** Map roleSubType to router segment_type and base. */
function getSegmentTypeAndBase(roleType, roleSubType) {
  if (roleType === "chair") {
    if (roleSubType === "openingChair" || roleSubType === "transition" || roleSubType === "reprimand" || roleSubType === "closingChair") {
      return { segment_type: "chair_procedural", base: 80 };
    }
    return { segment_type: "chair_procedural", base: 80 };
  }
  if (roleSubType === "interjection") return { segment_type: "interjection", base: 120 };
  if (roleSubType === "pro_statement" || roleSubType === "con_statement") return { segment_type: "opening_statement", base: 220 };
  if (roleSubType === "pro_rebuttal" || roleSubType === "con_rebuttal") return { segment_type: "rebuttal", base: 260 };
  if (roleSubType === "pro_summary" || roleSubType === "con_summary") return { segment_type: "closing", base: 520 };
  return { segment_type: "rebuttal", base: 260 };
}

/**
 * Route one segment. Pure function.
 * @param {{
 *   motion: string,
 *   segment: { roleType: string, roleSubType?: string, speakerId?: string },
 *   banlist_size: number,
 *   must_hook?: boolean,
 *   exact_sentence_count?: boolean,
 *   persona_complexity?: 'low'|'medium'|'high',
 *   context_length?: 'short'|'medium'|'long',
 *   quality_mode?: 'draft'|'show'|'final',
 *   cheap_failures_recent?: number
 * }} input
 * @param {{ cheapModel: string, expensiveModel: string }} models
 * @returns {{ model: string, max_tokens: number, temperature: number, strictness: number, risk: string, fallback: object, reason: string }}
 */
export function routeSegment(input, models = {}) {
  const cheapModel = (models.cheapModel || "openai/gpt-4o-mini").trim();
  const expensiveModel = (models.expensiveModel || "anthropic/claude-opus-4").trim();

  const segment = input.segment || {};
  const roleType = segment.roleType || "debater";
  const roleSubType = segment.roleSubType || "";

  const { segment_type, base } = getSegmentTypeAndBase(roleType, roleSubType);
  const must_hook = input.must_hook ?? /rebuttal|summary/.test(roleSubType);
  const exact_sentence_count = input.exact_sentence_count ?? (roleSubType === "interjection" || roleSubType === "closingChair");
  const banlist_size = Math.max(0, Number(input.banlist_size) ?? 0);
  const context_length = input.context_length || "medium";
  const persona_complexity = input.persona_complexity || "medium";
  const quality_mode = input.quality_mode || "show";
  const cheap_failures_recent = Math.max(0, Number(input.cheap_failures_recent) ?? 0);

  // 1) STRICTNESS (0–10)
  let strictness = 0;
  if (exact_sentence_count) strictness += 3;
  if (must_hook) strictness += 2;
  if (banlist_size >= 20) strictness += 2;
  else if (banlist_size >= 10) strictness += 1;
  if (context_length === "long") strictness += 2;
  else if (context_length === "medium") strictness += 1;
  if (persona_complexity === "high") strictness += 1;
  strictness = Math.max(0, Math.min(10, strictness));

  // 2) RISK
  let risk = "low";
  if (strictness >= 8 || quality_mode === "final" || cheap_failures_recent >= 2) risk = "high";
  else if ((strictness >= 5 && strictness <= 7) || quality_mode === "show" || cheap_failures_recent === 1) risk = "medium";

  // 3) MODEL
  const useExpensive = risk === "high";
  const model = useExpensive ? expensiveModel : cheapModel;

  // 4) MAX_TOKENS
  let max_tokens = base;
  if (exact_sentence_count) max_tokens = Math.min(max_tokens, 220);
  if (quality_mode === "final") max_tokens = Math.round(max_tokens * 1.15);
  if (!useExpensive && strictness >= 6) max_tokens = Math.round(max_tokens * 0.9);
  max_tokens = Math.max(60, Math.min(900, max_tokens));

  // 5) TEMPERATURE
  let temperature = 0.6;
  if (exact_sentence_count || banlist_size >= 20) temperature = 0.45;
  else if (quality_mode === "final") temperature = 0.55;
  if (useExpensive && strictness >= 8) temperature = 0.4;

  // 6) FALLBACK
  const fallback = {
    retry_cheap: useExpensive ? 0 : 1,
    upgrade_to_opus: !useExpensive && risk !== "low",
    failure_conditions: [
      "constraint_violation",
      "missing_hook",
      "forbidden_phrase",
      "generic_voice",
      "persona_drift",
      "nonresponsive"
    ]
  };

  const reason = `strictness=${strictness} risk=${risk} segment=${segment_type} base=${base}→${max_tokens}tok`;
  return {
    model,
    max_tokens,
    temperature,
    strictness,
    risk,
    fallback,
    reason
  };
}
