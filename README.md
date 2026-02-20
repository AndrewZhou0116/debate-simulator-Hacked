# Real-time Debate Simulator

A real-time fact debate simulator with an SVG stage, text-to-speech, and AI-powered speakers. Enter a topic, start the debate, and watch Pro/Con teams and a chair deliver streamed turns with optional voice playback.

**Features:**

- **Realtime SSE streaming** — debate turns stream from the server as they’re generated.
- **Browser TTS** — optional voice mode plays each turn using the Web Speech API (no external TTS required).
- **Join as slot** — choose a debater or chair slot to type (or speak) your own turn when it’s your turn.
- **Structured conclusion** — request an AI-generated summary with key points and outcome.

**Tech stack:** Node.js, Express, OpenRouter (LLM), Browser TTS (Web Speech API). Frontend: vanilla JS, no build step. Suited for hackathon demos: minimal setup, stream-first, configurable model for speed vs quality.

---

## Quickstart

```bash
git clone <repo-url>
cd debate
npm install
cp .env.example .env
```

Edit `.env` and set your OpenRouter API key:

```bash
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

Then run:

```bash
npm run dev
```

Open **http://localhost:3000** in a modern browser (Chrome/Edge recommended for TTS).

**One-command run (after first-time setup):**

```bash
npm run dev
```

(or `npm start` — same behavior.)

---

## Notes

- **Voice mode:** If you enable “Voice mode,” the browser may ask for microphone permission when you use voice input. TTS playback uses the Web Speech API and does not require a mic.
- **Browser:** Chrome or Edge is recommended for the best TTS and SSE experience.
- **API key:** Get a key at [OpenRouter](https://openrouter.ai/keys). In `.env`, set `OPENROUTER_MODEL`: `anthropic/claude-sonnet-4` (fast, recommended for demos) or `anthropic/claude-opus-4` (highest quality).

---

## Demo steps

1. Enter a topic (e.g. “This house would ban homework”).
2. Optionally choose **Join as** (e.g. Pro 1) to speak or type when it’s your turn.
3. Click **Start** — the debate runs automatically with streamed turns.
4. Click **Conclusion** when the debate is over to get a structured summary.

---

## Project layout

- `server.js` — Express + SSE stream, OpenRouter, conclusion API
- `debate-generation.js` — segment prompts and LLM calls
- `debate-config.js` — flow mode, token budgets, debug flags
- `prompts.js` — system/user prompts and persona rules
- `public/` — static frontend (index.html, app.js, styles.css, assets)
- Optional docs: `PROJECT_OVERVIEW_CN.md` (overview in Chinese), `VOICE_SETUP.md` (TTS/voice)
