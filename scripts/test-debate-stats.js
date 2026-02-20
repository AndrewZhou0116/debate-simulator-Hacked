/**
 * Run one full-script round and report style/structure stats.
 * Usage: node scripts/test-debate-stats.js [baseUrl]
 * Requires server running (e.g. npm start) and OPENROUTER_API_KEY in .env.
 */

const baseUrl = process.argv[2] || "http://localhost:3000";
const topic = "Social media does more good than harm.";

function countSentences(text) {
  if (!text || typeof text !== "string") return 0;
  return (text.match(/[^.!?]*[.!?]+/g) || []).map((s) => s.trim()).filter(Boolean).length;
}

function endsWithQuestion(text) {
  return /\?$/.test((text || "").trim());
}

/** Extract short phrases (3–8 words) that might be "hook" phrases for repetition check. */
function extractShortPhrases(text, maxWords = 8) {
  if (!text || typeof text !== "string") return [];
  const lower = text.trim().toLowerCase().replace(/\s+/g, " ");
  const words = lower.split(/\s+/).filter(Boolean);
  const set = new Set();
  for (let len = 3; len <= Math.min(maxWords, words.length); len++) {
    for (let i = 0; i <= words.length - len; i++) {
      set.add(words.slice(i, i + len).join(" "));
    }
  }
  return [...set];
}

/** True if turn text shares a 3+ word contiguous phrase with previous turn (case-insensitive). */
function hookRepetition(currentText, previousText) {
  if (!previousText || !currentText) return false;
  const prevPhrases = extractShortPhrases(previousText, 6);
  const curr = (currentText || "").trim().toLowerCase();
  return prevPhrases.some((p) => p.length >= 12 && curr.includes(p));
}

/** Chair violation: summary/essay tone. */
function chairViolation(speakerId, text) {
  if (speakerId !== "chair" || !text) return false;
  const t = text.toLowerCase();
  return (
    /proposition\s+states/i.test(t) ||
    /in\s+summary/i.test(t) ||
    /\b(summary|summarizing|to\s+sum\s+up)\b/i.test(t)
  );
}

async function main() {
  console.log("Calling POST", baseUrl + "/api/generateScript", "topic:", topic);
  let data;
  try {
    const res = await fetch(baseUrl + "/api/generateScript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic }),
    });
    if (!res.ok) {
      console.error("HTTP", res.status, await res.text());
      process.exit(1);
    }
    data = await res.json();
  } catch (e) {
    console.error("Request failed:", e.message);
    process.exit(1);
  }

  const turns = data.turns || [];
  if (!turns.length) {
    console.log("No turns returned.");
    return;
  }

  const stats = {
    totalTurns: turns.length,
    debaterTurns: 0,
    chairTurns: 0,
    sentenceCounts: [],
    questionEndings: 0,
    closureEndings: 0,
    hookRepetitions: 0,
    chairViolations: 0,
  };

  const report = [];

  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    const text = (t.text || "").trim();
    const speakerId = t.speakerId || "";
    const isChair = speakerId === "chair";
    if (isChair) stats.chairTurns++;
    else stats.debaterTurns++;

    const sentCount = countSentences(text);
    stats.sentenceCounts.push(sentCount);
    const qEnd = endsWithQuestion(text);
    if (qEnd) stats.questionEndings++;
    else if (!isChair) stats.closureEndings++;

    if (i > 0 && hookRepetition(text, turns[i - 1].text)) {
      stats.hookRepetitions++;
      report.push(`  [${i + 1}] ${speakerId}: hook repetition with previous turn`);
    }
    if (chairViolation(speakerId, text)) {
      stats.chairViolations++;
      report.push(`  [${i + 1}] chair: summary/essay tone violation`);
    }
  }

  const qmarkRatio = stats.totalTurns ? (stats.questionEndings / stats.totalTurns) * 100 : 0;
  const closureRatio =
    stats.debaterTurns ? (stats.closureEndings / stats.debaterTurns) * 100 : 0;
  const avgSent = stats.sentenceCounts.length
    ? stats.sentenceCounts.reduce((a, b) => a + b, 0) / stats.sentenceCounts.length
    : 0;

  console.log("\n--- Debate style stats (one round) ---\n");
  console.log("Total turns:", stats.totalTurns, "| Chair:", stats.chairTurns, "| Debaters:", stats.debaterTurns);
  console.log("Sentence count per turn: min", Math.min(...stats.sentenceCounts), "max", Math.max(...stats.sentenceCounts), "avg", avgSent.toFixed(1));
  console.log("Question (?) ending: ", stats.questionEndings, "/", stats.totalTurns, "=", qmarkRatio.toFixed(0) + "%", qmarkRatio <= 50 ? "(ok)" : "(>50%)");
  console.log("Closure (no ?) debater turns:", stats.closureEndings, "/", stats.debaterTurns, "=", closureRatio.toFixed(0) + "%", closureRatio >= 30 ? "(ok)" : "(<30%)");
  console.log("Hook repetition (consecutive same phrase):", stats.hookRepetitions, stats.hookRepetitions === 0 ? "(ok)" : "(fail)");
  console.log("Chair violations (summary/essay tone):", stats.chairViolations, stats.chairViolations === 0 ? "(ok)" : "(fail)");
  if (report.length) {
    console.log("\nDetails:");
    report.forEach((r) => console.log(r));
  }
  console.log("\nPer-turn: [index] speakerId sentences ?-ending");
  turns.forEach((t, i) => {
    const s = countSentences(t.text);
    const q = endsWithQuestion(t.text) ? "?" : ".";
    console.log(`  [${i + 1}] ${t.speakerId} ${s} sent ${q}`);
  });
  console.log("");
}

main();
