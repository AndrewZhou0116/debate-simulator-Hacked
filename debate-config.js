/**
 * Tunable debate generation config.
 * - Turn length: default 1–2 sentences (micro-turns); per-speaker overrides.
 * - flowMode: "classic" (Pro1→Con1→Pro2→…) or "micro" (frequent Chair, rapid switch).
 * - heatLevel: "low" | "medium" | "high".
 * - logPromptForSpeakers: full user prompt printed for these (e.g. ["pro2", "con3"]).
 * - debugLogBeforeGeneration: log speakerId, side, background length, first 60 chars before each generation.
 * - Emojis: facial only, at most 1 at end of debater turn (optional); Chair: configurable (off for authority).
 */

/** Per-turn max_tokens (enough for dense 2–3 sentences + one logical step + character tics). */
export const TOKEN_BUDGETS = {
  chairMicro: 100,
  debaterMicro: 260,
  interjection: 60,
  detailTurn: 360,
  compressionPass: 140
};

/**
 * Quality Ladder: budget ranges by stage. Used when useQualityLadder=true.
 * segmentBudget(stage, strictness, quality_mode) clamps to these and applies exact_sentence cap.
 */
export const QUALITY_LADDER_BUDGETS = {
  transition: { min: 80, max: 160 },
  definition_request: { min: 80, max: 160 },
  chair_procedural: { min: 80, max: 160 },
  interjection: { min: 120, max: 220 },
  opening_statement: { min: 180, max: 280 },
  rebuttal: { min: 220, max: 360 },
  crossfire: { min: 220, max: 360 },
  closing: { min: 500, max: 900 },
  conclusion: { min: 500, max: 900 }
};

/** When exact_sentence_count=true, cap max_tokens to avoid run-on. */
export const QUALITY_LADDER_EXACT_SENTENCE_CAP = 220;

/** Repair pass: lower temp, smaller token budget. */
export const QUALITY_LADDER_REPAIR = {
  max_tokens: 250,
  temperature_min: 0.25,
  temperature_max: 0.4
};

/** Optional: use a cheaper model for compression only. If unset, server OPENROUTER_MODEL is used. */
export const MODEL_CONFIG = {
  cheapModelForCompression: null
};

export const DEBATE_CONFIG = {
  minSentences: 1,
  maxSentences: 2,
  /** Per-speaker [min, max] sentences. Debaters: 1–3 default; 4–6 only in detailMode; interjection 1. */
  turnSentencesBySpeaker: {
    chair: [1, 2],
    pro1: [1, 3],
    pro2: [1, 3],
    pro3: [1, 3],
    con1: [1, 3],
    con2: [1, 3],
    con3: [1, 3]
  },
  /** "classic" = standard order with interjections; "micro" = fixed 14-turn order (no Chair between each). */
  flowMode: "micro",
  /** If true, middle segments are shuffled (no same speaker twice in a row). If false, use the defined order. */
  shuffleSegmentOrder: false,
  heatLevel: "high",
  strictness: "hard",
  /** Set to e.g. ["pro2", "con3"] to log full user prompt for those speakers. */
  logPromptForSpeakers: [],
  debugLogBeforeGeneration: false,
  logTokenBudget: false,
  sanitizeOutputForbidden: true,
  allowFacialEmoji: true,
  maxFacialPerTurn: 1,
  chairEmojis: false,
  enableSideFlipDetector: true,
  /** If true, 2-step generate: draft then compress to 1–2 sentences (extra API call). */
  useCompressStep: true,
  /** Quality Ladder: default 4o-mini, validate, repair once, then upgrade to Opus only if needed. When true, useQualityLadder overrides budget router for segment generation. */
  useQualityLadder: true
};
