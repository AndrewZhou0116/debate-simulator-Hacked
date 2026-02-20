/**
 * scripts/test-debate-round.js
 *
 * Local test harness: fixed motion, 14-turn micro-round.
 * Run: node scripts/test-debate-round.js
 * Requires OPENROUTER_API_KEY in .env or environment (depending on your generator).
 */

"use strict";

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// ---- Imports (aligned to debate-generation.js and debate-style.js exports) ----
import {
  generateSegmentText,
  buildSegmentPrompt,
} from "../debate-generation.js";
import { NON_FACIAL_EMOJI_PATTERN } from "../debate-style.js";
import { DEBATE_CONFIG } from "../debate-config.js";

// ---- Motion ----
const MOTION =
  'This house would allow law enforcement and courts to use AI risk scores to determine bail, surveillance intensity, and preemptive interventions.';

// ---- Micro-turn flow (14 turns, Chair only open/close) ----
const SEGMENTS = [
  { id: "chair_open", speakerId: "chair", label: "Chair", roleType: "chair", roleSubType: "openingChair" },

  { id: "pro1_1", speakerId: "pro1", label: "Pro 1", roleType: "debater", roleSubType: "pro_statement" },
  { id: "con3_1", speakerId: "con3", label: "Con 3", roleType: "debater", roleSubType: "con_statement" },
  { id: "pro2_1", speakerId: "pro2", label: "Pro 2", roleType: "debater", roleSubType: "pro_statement" },
  { id: "con1_1", speakerId: "con1", label: "Con 1", roleType: "debater", roleSubType: "con_statement" },
  { id: "pro3_1", speakerId: "pro3", label: "Pro 3", roleType: "debater", roleSubType: "pro_statement" },
  { id: "con2_1", speakerId: "con2", label: "Con 2", roleType: "debater", roleSubType: "con_statement" },

  { id: "pro1_2", speakerId: "pro1", label: "Pro 1", roleType: "debater", roleSubType: "pro_rebuttal" },
  { id: "con3_2", speakerId: "con3", label: "Con 3", roleType: "debater", roleSubType: "con_rebuttal" },
  { id: "pro2_2", speakerId: "pro2", label: "Pro 2", roleType: "debater", roleSubType: "pro_rebuttal" },
  { id: "con1_2", speakerId: "con1", label: "Con 1", roleType: "debater", roleSubType: "con_rebuttal" },
  { id: "pro3_2", speakerId: "pro3", label: "Pro 3", roleType: "debater", roleSubType: "pro_rebuttal" },
  { id: "con2_2", speakerId: "con2", label: "Con 2", roleType: "debater", roleSubType: "con_rebuttal" },

  { id: "chair_close", speakerId: "chair", label: "Chair", roleType: "chair", roleSubType: "closingChair" },
];

// ---- Side mapping (used for validation only) ----
const SIDE_BY_SPEAKER = {
  chair: "CHAIR",
  pro1: "PRO",
  pro2: "PRO",
  pro3: "PRO",
  con1: "CON",
  con2: "CON",
  con3: "CON",
};

// ---- Sentence budgets (1–3 non-detail; 4–6 only in detailMode; interjection 1) ----
const DEFAULT_MAX_SENTENCES = 3;
const MAX_SENTENCES_BY_SPEAKER = {
  chair: 2,
  pro1: 3,
  pro2: 3,
  pro3: 3,
  con1: 3,
  con2: 3,
  con3: 3,
};

const DETAIL_MODE_SENTENCES = 6;

// ---- Helpers: sentence counting, simple validations ----
function countSentences(text) {
  if (!text) return 0;
  // Rough heuristic: split on terminal punctuation. (Works well enough for enforcement reports.)
  const parts = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  return parts.length;
}

function hasNonFacialEmoji(text) {
  if (!text) return false;
  if (!NON_FACIAL_EMOJI_PATTERN) return false; // if not available, skip
  return NON_FACIAL_EMOJI_PATTERN.test(text);
}

function looksLikeTeamAttack(text, speakerId) {
  // Simple heuristic: disallow directly addressing teammates by label (e.g., "Pro 3, ...") or speakerId
  // You can improve this, but keep it lightweight.
  if (!text) return false;
  const side = SIDE_BY_SPEAKER[speakerId];
  if (side === "CHAIR") return false;

  const teammateLabels = side === "PRO" ? ["Pro 1", "Pro 2", "Pro 3"] : ["Con 1", "Con 2", "Con 3"];
  const teammateIds = side === "PRO" ? ["pro1", "pro2", "pro3"] : ["con1", "con2", "con3"];

  // Allow self reference:
  const selfLabel = speakerId === "pro1" ? "Pro 1"
    : speakerId === "pro2" ? "Pro 2"
    : speakerId === "pro3" ? "Pro 3"
    : speakerId === "con1" ? "Con 1"
    : speakerId === "con2" ? "Con 2"
    : speakerId === "con3" ? "Con 3" : null;

  const filteredLabels = teammateLabels.filter((x) => x !== selfLabel);
  const filteredIds = teammateIds.filter((x) => x !== speakerId);

  const labelHit = filteredLabels.some((lab) => text.includes(lab + ":") || text.includes(lab + ",") || text.includes(lab));
  const idHit = filteredIds.some((id) => text.includes(id));
  return labelHit || idHit;
}

// ---- Context tracking ----
// Generator uses context.previousOpponentText and context.recentTurns (last 2–3 turns for anchoring).
function makeInitialContext() {
  return {
    lastProText: "",
    lastConText: "",
    lastSpeakerText: "",
    detailMode: false,
    recentTurns: [],
  };
}

function updateContext(context, seg, text) {
  if (seg.roleType === "debater") {
    const isPro = seg.speakerId.startsWith("pro");
    if (isPro) {
      context.lastProText = text;
    } else {
      context.lastConText = text;
    }
    context.lastSpeakerText = text;
  }
  context.recentTurns = (context.recentTurns || []).concat([{ speakerId: seg.speakerId, label: seg.label, text }]).slice(-3);
}

// ---- Main runner ----
async function run() {
  console.log("=== TEST DEBATE ROUND (micro-turn, 14 turns) ===");
  console.log("MOTION:", MOTION);
  console.log("");

  // Optional: warn if compression is disabled in config
  if (DEBATE_CONFIG && DEBATE_CONFIG.useCompressStep === false) {
    console.warn(
      "[WARN] DEBATE_CONFIG.useCompressStep is false. Turn length may exceed 1–2 sentences. " +
      "Consider setting it true for stable pacing."
    );
    console.log("");
  }

  if (typeof generateSegmentText !== "function") {
    throw new Error(
      "generateSegmentText is not found. Please adjust the import from debate-generation.js.\n" +
      "Expected export: generateSegmentText(topic, segment, context, opts)."
    );
  }

  const apiKey = (process.env.OPENROUTER_API_KEY || "").trim().replace(/\s/g, "");
  const model = (process.env.OPENROUTER_MODEL || "").trim();
  if (!model) throw new Error("OPENROUTER_MODEL is required. Set it in .env (e.g. OPENROUTER_MODEL=anthropic/claude-opus-4).");

  const opts = {
    apiKey,
    model,
    sanitizeOutput: DEBATE_CONFIG?.sanitizeOutputForbidden !== false,
    logPromptSpeakers: ["pro2", "con3"],
    debugLogBeforeGeneration: DEBATE_CONFIG?.debugLogBeforeGeneration !== false,
    enableSideFlipDetector: DEBATE_CONFIG?.enableSideFlipDetector !== false,
  };

  const context = makeInitialContext();

  const report = {
    totalTurns: 0,
    chairTurns: 0,
    consecutiveSpeakerViolations: 0,
    sentenceBudgetViolations: 0,
    sentenceViolationSegments: [],
    nonFacialEmojiViolations: 0,
    teamAttackFlags: 0,
    turns: [],
  };

  let lastSpeakerId = null;
  const logPromptSpeakers = ["pro2", "con3"];

  for (let i = 0; i < SEGMENTS.length; i++) {
    const seg = SEGMENTS[i];
    const speakerId = seg.speakerId;

    // Enforce "no consecutive same speaker" at the script level (should already be true)
    if (speakerId === lastSpeakerId) {
      report.consecutiveSpeakerViolations++;
    }
    lastSpeakerId = speakerId;

    // Only trigger detail mode if explicitly requested (keep false here by default)
    context.detailMode = Boolean(seg.detailMode);

    // Opponent text for generator (aligned to debate-generation / server usage)
    const isChair = seg.roleType === "chair";
    const isPro = speakerId.startsWith("pro");
    const previousOpponentText = isChair ? context.lastSpeakerText : isPro ? context.lastConText : context.lastProText;
    const genContext = { ...context, previousOpponentText, recentTurns: context.recentTurns || [] };

    // Optional: show prompt for debugging
    if (typeof buildSegmentPrompt === "function" && logPromptSpeakers.includes(speakerId)) {
      try {
        const p = buildSegmentPrompt(MOTION, seg, genContext);
        console.log(`\n--- [PROMPT PREVIEW] speakerId=${speakerId} side=${SIDE_BY_SPEAKER[speakerId]} ---`);
        console.log((p && p.user) ? p.user : String(p));
        console.log("--- [END PROMPT PREVIEW] ---\n");
      } catch (e) {
        console.warn("[WARN] buildSegmentPrompt failed:", e.message);
      }
      logPromptSpeakers.splice(logPromptSpeakers.indexOf(speakerId), 1);
    }

    // Generate
    let out = await generateSegmentText(MOTION, seg, genContext, opts);

    // Some generators return { text, meta } etc
    const text = (typeof out === "string") ? out : (out && out.text) ? out.text : String(out);

    // Print transcript
    console.log(`${seg.label}: ${text}\n`);

    // Update context for next turn
    updateContext(context, seg, text);

    // Update report
    report.totalTurns++;
    if (speakerId === "chair") report.chairTurns++;

    const maxSentences = context.detailMode ? DETAIL_MODE_SENTENCES : (seg.roleSubType === "interjection" ? 1 : (MAX_SENTENCES_BY_SPEAKER[speakerId] ?? DEFAULT_MAX_SENTENCES));
    const sCount = countSentences(text);

    const budgetViolation = !context.detailMode && sCount > maxSentences;
    if (budgetViolation) {
      report.sentenceBudgetViolations++;
      report.sentenceViolationSegments.push(`${seg.id}: ${sCount} sentences (max ${maxSentences})`);
    }

    if (hasNonFacialEmoji(text)) report.nonFacialEmojiViolations++;
    if (looksLikeTeamAttack(text, speakerId)) report.teamAttackFlags++;

    report.turns.push({
      i: i + 1,
      speakerId,
      side: SIDE_BY_SPEAKER[speakerId],
      sentences: sCount,
      budget: maxSentences,
      detailMode: context.detailMode,
      budgetViolation,
      nonFacialEmoji: hasNonFacialEmoji(text),
      teamAttackFlag: looksLikeTeamAttack(text, speakerId),
    });
  }

  // ---- Summary report ----
  console.log("=== VALIDATION REPORT ===");
  console.log(`Total turns: ${report.totalTurns}`);
  console.log(`Chair turns: ${report.chairTurns} (target: 2)`);
  console.log(`Consecutive speaker violations: ${report.consecutiveSpeakerViolations}`);
  console.log(`Sentence budget violations: ${report.sentenceBudgetViolations}`);
  if (report.sentenceViolationSegments.length) {
    console.log(`Sentence violations: ${report.sentenceViolationSegments.join("; ")}`);
  }
  console.log(`Non-facial emoji violations: ${report.nonFacialEmojiViolations}`);
  console.log(`Possible teammate-attack flags: ${report.teamAttackFlags}`);
  console.log("");

  // Print per-turn stats
  console.log("Turn | Speaker | Side  | Sentences | Budget | Detail | BudgetOK | NonFacialEmoji | TeamAttackFlag");
  console.log("-----|---------|-------|-----------|--------|--------|----------|----------------|--------------");
  for (const t of report.turns) {
    const ok = t.budgetViolation ? "NO" : "YES";
    console.log(
      `${String(t.i).padStart(4)} | ${t.speakerId.padEnd(7)} | ${t.side.padEnd(5)} | ${String(t.sentences).padStart(9)} | ${String(t.budget).padStart(6)} | ${String(t.detailMode).padEnd(6)} | ${ok.padEnd(8)} | ${String(t.nonFacialEmoji).padEnd(14)} | ${String(t.teamAttackFlag)}`
    );
  }

  console.log("\nDone.");
}

run().catch((err) => {
  console.error("Test harness failed:", err);
  process.exit(1);
});
