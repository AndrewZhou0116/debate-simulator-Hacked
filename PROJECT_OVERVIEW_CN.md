# Real-time Debate Simulator — 项目介绍

实时辩论模拟器：法庭/电视辩论场景下，由 AI 扮演主席与正反方辩手进行英文辩论，支持 TTS 朗读、流式文字、用户顶替辩位**打字或语音**参与及辩论后结构化结论生成。

---

## 一、项目定位

- **形态**：单辩题、固定流程、七名固定角色（1 主席 + 3 正方 + 3 反方），英文输出。
- **技术栈**：Node.js (Express) + OpenRouter 大模型 + 前端静态页（无框架）+ 浏览器 TTS / 可选外部 TTS（如 ElevenLabs）。
- **风格**：电视辩论节目感、高对抗、短回合、角色人格鲜明；非政策备忘录或学术评论体。
- **能力**：TTS 队列播放、逐句流式打字机、用户选位**打字或语音**参与、Transcript 结构化展示与复制、Conclusion 结构化总结。

---

## 二、辩论流程与回合

### 2.1 流程模式（`debate-config.js`）

| 模式 | 说明 |
|------|------|
| **`flowMode: "micro"`**（默认） | 固定 14 回合：主席开场 → Pro1 → Con3 → Pro2 → Con1 → Pro3 → Con2 → 再一轮 Pro1→Con3→Pro2→Con1→Pro3→Con2 → 主席收尾；可开 `shuffleSegmentOrder` 打乱中间顺序（首尾主席不动）。 |
| **`flowMode: "classic"`** | 主席 → Pro1 → 主席 → Con1 → … → Pro3 → 主席 → Con3 → 主席收尾；可随机插入插嘴 + 主席训斥（至少 2 次）。 |

### 2.2 回合类型（roleSubType）

- **主席**：`openingChair`（开场/陈述辩题并交给首辩）、`transition`（过渡/点名下一人）、`closingChair`（收尾）、`reprimand`（训斥插嘴者）；主席不要求定义。
- **辩手**：`pro_statement` / `con_statement`、`pro_rebuttal` / `con_rebuttal`、`pro_summary` / `con_summary`、`interjection`（插嘴，仅 1 句）。

### 2.3 长度与 Token

- **句数**：默认 1–2；`turnSentencesBySpeaker` 可配（如 1–3）；`detailMode` 下 3–6；插嘴固定 1 句。
- **Token 预算**：主席 ~120、辩手微回合 ~180、插嘴 ~70、压缩步 ~140、详述 ~500。
- **后处理**：超句数触发压缩步；单回合最多 1 个问号；站错边重试；模板句/抽象名词触发重写；禁止语与 emoji 规则过滤。

---

## 三、角色与人设

| 角色 ID | 显示名 | 立场 | 人设概要 |
|--------|--------|------|----------|
| chair | Makima (Chair) | 主席 | 冷峻控场，仅程序性发言（陈述辩题、过渡、收尾），不要定义、不站队、不总结 |
| pro1 | Donald Trump | 正方 1 | 短句、怼人、自信；“Wrong.” “Period.” “Believe me.”；首回合直接立论（可简短澄清辩题） |
| pro2 | Light Yagami | 正方 2 | 优越感、冷嘲热讽；“How noble. How wrong.” |
| pro3 | Immanuel Kant | 正方 3 | 严谨逻辑、义务论用语（universalize, persons as ends） |
| con1 | Gus Fring | 反方 1 | 冷静企业腔，每回合一失败模式 + 一替代方案，话术不重复 |
| con2 | Albert Camus | 反方 2 | 道德怀疑、人的代价、干涩反讽；“Efficiency is not innocence.” |
| con3 | Isaac Newton | 反方 3 | 讨厌模糊，要求可测量（定义、基线、阈值），角度轮换 |

角色背景来自 `character-backgrounds.js`，在每回合 `buildSegmentPrompt` 时注入；规则、禁止语、回合形状等在 `prompts.js`。

---

## 四、后端 API 与数据流

### 4.1 环境（`.env`）

- **OpenRouter**：`OPENROUTER_API_KEY` 或 `OPENROUTER_KEY`；`OPENROUTER_MODEL` 需在 `.env` 中设置，推荐 `anthropic/claude-sonnet-4`（快）或 `anthropic/claude-opus-4`（质量最高）。
- **TTS**：`TTS_MODE=browser`（默认）或 `external`；外部见 `VOICE_SETUP.md`（如 ElevenLabs）。
- **诊断**（非生产）：`GET /api/diag/openrouter`、`POST /api/diag/openrouter-test`。

### 4.2 主要接口

| 接口 | 方法 | 作用 |
|------|------|------|
| `/api/start` | POST | 开始前调用，返回 `{ ok: true }`；实际辩论由流式接口驱动 |
| `/api/stream` | GET | **核心**：按 `topic` + 可选 `userSlot` 建 SSE；按 segments 顺序生成；用户位发 `your_turn` 并等 `/api/user-speech` |
| `/api/user-speech` | POST | 用户提交发言：`streamId`, `segmentId`, `text` |
| `/api/conclusion` | POST | 辩题 + 前端 `turns` → 结构化结论（title + sections） |
| `/api/tts/config` | GET | TTS 模式与 provider |
| `/api/tts` | POST | 外部 TTS 按句请求音频 |
| `/api/generateScript` | POST | 一次性生成整场稿（无用户位） |

### 4.3 SSE 事件

- `status`：`debate_started`（带 `streamId`）、`debate_finished`。
- `your_turn`：轮到用户，含 `segmentId`, `speakerId`, `speakerLabel` 等。
- `speech`：单句/整段 AI 发言（含 `text`, `fullText`, `isFirstSentence`, `isLastSentence` 等）。
- `error`：生成或鉴权失败。

### 4.4 生成管线（`debate-generation.js`）

- 单回合：`generateSegmentText` → `buildSegmentPrompt`（角色背景 + `prompts.js` + **TURN PATCH**）→ OpenRouter；可选压缩、side-flip 重试、template/multi-question 重写；最后禁止语与 emoji 过滤。
- 上下文：`previousOpponentText`、`recentTurns`、`sameSideTurns`、`previousTurnWasUser` 等，保证接话连贯、不反驳己方。

---

## 五、前端功能与 UI

- **顶部**：辩题输入、Join as（None / Pro 1–3, Con 1–3）、Voice mode 开关、Start / Stop·Reset / Conclusion。
- **舞台**：法庭背景 + SVG 前景（七角色 + 桌子）；当前发言条（Current speech bar）。**一键全屏**：点击“Fullscreen”进入沉浸全屏，再点“Exit fullscreen”或按 Esc 丝滑退出；进入/退出带过渡动画。
- **Transcript**：结构化条目（发言人、角色标签、正/反/主席徽章）、当前说话高亮、复制脚本、可折叠；“**随语音/文字更新时，仅当用户处在底部附近才自动滚到底部，否则可自由向上滚动查看历史**”；滚动上去后显示“Jump to latest”回到底部。
- **你的回合弹窗**：可**打字**（文本框）或**语音输入**（Web Speech API）；提交时优先使用打字内容，无则使用语音识别结果；按钮为“Submit”。
- **Conclusion 弹窗**：展示 `/api/conclusion` 的 title + sections。

---

## 六、配置与可调项

| 位置 | 内容 |
|------|------|
| **`.env`** | OpenRouter key/model、PORT；TTS 见 `VOICE_SETUP.md` |
| **`debate-config.js`** | `flowMode`、`shuffleSegmentOrder`、`turnSentencesBySpeaker`、`heatLevel`、`useCompressStep`、`allowFacialEmoji`、`chairEmojis`、`enableSideFlipDetector`、日志开关等 |
| **`prompts.js`** | 系统/用户模板、主席/辩手规则、禁止语、**TURN PATCH**、压缩/重写提示等 |
| **`character-backgrounds.js`** | 七角色背景描述 |
| **前端 `app.js`** | TTS 配置、发言人显示名、语音偏好、**Transcript 底部阈值**等 |

---

## 七、新功能须知

以下为近期加入、与“每回合约束”和“Transcript 体验”相关的行为，开发与二次开发时需注意。

### 7.1 TURN PATCH（每回合硬约束块）

- **位置**：`prompts.js` 中 `TURN_PATCH_TEMPLATE` + `buildTurnPatch()`；在 `buildPrompt()` 末尾对**每个 segment** 都会把填好的 TURN PATCH 追加到 user 消息。
- **作用**：对**当前这一句**施加硬约束，避免模型忽略句数、挂钩或立场。
- **内容概览**：  
  - 辩题、当前发言人、立场（PRO/CON）、segment 类型。  
  - **硬限制**：句数上限（EXACTLY N）、问号最多 1、heat、emoji 政策、禁止语列表。  
  - **即时上下文**：Chair cue、上一句对方、同侧上句、最近几回合摘要。  
  - **首句挂钩**：必须从对方上一句或 Chair cue 中指名/引用/改写一点，禁止泛泛开场。  
  - **立场锁**：PRO 只推进正方，CON 只推进反方；若承认对方一点，必须立刻翻转（“Even if…”“That’s exactly why…”等）。  
  - **Segment 形状**：按 `roleSubType` 约束（如 openingChair 陈述辩题+交给首辩、不要定义，rebuttal 打一点+揭一假设+给一替代机制，summary 压缩主线不铺新框架等）。  
  - **事实纪律**：不捏造研究/数据；不确定时用条件表述并指出可验证方式（audit/baseline/threshold）。  
  - **输出**：仅输出本段演讲正文，无标签、无分析、无格式。
- **扩展**：改约束文案请改 `TURN_PATCH_TEMPLATE`；新增占位符请在 `buildTurnPatch()` 中从 `topic/segment/context/options` 取值并 `replace`。`debate-generation.js` 传入的 `options` 已包含 `sentenceBudget`、`heatLevel`、`allowFacialEmoji`、`chairEmojis`。

### 7.2 Transcript 滚动行为（随语音/文字更新不抢滚轮）

- **问题**：之前随 TTS/打字机更新，每次 DOM 更新都会把 transcript 强制滚到底部，用户无法向上滚动查看历史。
- **现状**：  
  - 使用“是否在底部附近”判断：`isTranscriptNearBottom()`（距底 &lt; 80px 为“附近”）。  
  - **仅当** `isTranscriptNearBottom()` 为 true 时，才在以下时机把 transcript 滚到底部：  
    - 追加新条目（`createTranscriptLine`）；  
    - 打字机每 tick 更新当前句（`runTypewriter`）。  
  - 用户一旦向上滚动离开底部区域，自动滚动**不会**再执行，可自由用滚轮查看之前对话。  
  - “Jump to latest”按钮：当用户不在底部附近时显示，点击后滚到底部并刷新按钮可见性。
- **实现要点**：`app.js` 中 `TRANSCRIPT_NEAR_BOTTOM_THRESHOLD = 80`、`isTranscriptNearBottom()`、以及两处 `if (isTranscriptNearBottom()) transcriptEl.scrollTop = transcriptEl.scrollHeight`；`updateJumpToLatestVisibility()` 同样用 `isTranscriptNearBottom()` 决定是否显示按钮。
- **可调**：若需改变“多近算底部”，改 `TRANSCRIPT_NEAR_BOTTOM_THRESHOLD` 即可。

---

## 八、小结与扩展建议

- **流程**：辩题 + 可选用户位 → 服务端按 segments 顺序生成；用户位则等 `/api/user-speech`，否则 OpenRouter 生成并 SSE 推送。
- **质量**：角色背景 + 严格 prompt + **每回合 TURN PATCH** + 句数/问号/站边/模板/抽象词校验与重写、压缩步。
- **体验**：舞台视觉、TTS 队列与打字机、用户**打字或语音**参与、**Transcript 可自由上滚 + Jump to latest**、结论弹窗。

扩展时可优先改：`debate-config.js`（流程/长度）、`prompts.js`（风格/禁止语/**TURN PATCH**）、`character-backgrounds.js`（人设）、前端 TTS/Transcript 阈值与 UI。
