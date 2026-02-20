# 辩手语音与角色还原 (Character voice setup)

项目支持两种方式让辩手语音更贴近角色（如 Pro 1 特朗普风格、Chair 玛琪玛等）：**浏览器 TTS** 与 **外部 TTS（如 ElevenLabs）**。

---

## 1. 浏览器 TTS（无需额外服务）

使用系统/浏览器自带的语音合成，通过**偏好嗓音名**为每个角色固定一种“风格”的嗓音。

- **已做映射**（在 `public/app.js` 的 `SPEAKER_VOICE_PREFERENCES`）：
  - **Chair (Makima)**：优先女声（Zira, Samantha, Victoria 等）
  - **Pro 1 (Trump)**：偏深沉/有力（David, Mark）
  - **Pro 2 (Light)**：偏年轻男声（Daniel, James）
  - **Pro 3 (Kant)**：偏成熟（George）
  - **Con 1/2/3**：同上按角色风格分配不同男声

- **自定义**：在页面加载前覆盖 `window.DEBATE_SPEAKER_VOICE_PREFERENCES`，例如在 `index.html` 里加一段脚本：

```html
<script>
  window.DEBATE_SPEAKER_VOICE_PREFERENCES = {
    chair: ["zira", "samantha"],
    pro1: ["david", "mark"],
    pro2: ["daniel"],
    pro3: ["george"],
    con1: ["david"],
    con2: ["james"],
    con3: ["george"]
  };
</script>
<script src="app.js"></script>
```

- **限制**：浏览器 TTS 只有系统提供的通用嗓音，**无法**真正还原“特朗普本人”或动漫角色声线，只能做到“每个角色固定一种系统嗓音、风格略有区分”。

---

## 2. 外部 TTS（ElevenLabs）— 更贴近角色声音

使用 [ElevenLabs](https://elevenlabs.io) 等服务的多种/克隆嗓音，可以为每个辩手配置不同的 **voice_id**，实现“角色化”语音（包括更接近真人或特定风格的嗓音）。

### 2.1 环境变量（.env）

```env
TTS_MODE=external
TTS_PROVIDER=elevenlabs
TTS_API_KEY=你的_ElevenLabs_API_Key
TTS_VOICE_DEFAULT=默认的_voice_id

# 按辩手分别指定（可选；未设置则用 TTS_VOICE_DEFAULT）
TTS_VOICE_CHAIR=voice_id_for_makima
TTS_VOICE_PRO1=voice_id_for_trump_style
TTS_VOICE_PRO2=voice_id_for_light_style
TTS_VOICE_PRO3=voice_id_for_kant_style
TTS_VOICE_CON1=voice_id_for_gus_style
TTS_VOICE_CON2=voice_id_for_camus_style
TTS_VOICE_CON3=voice_id_for_newton_style
```

### 2.2 获取 voice_id

1. 登录 [ElevenLabs](https://elevenlabs.io) → **Voice Library**。
2. 选用现成声音或创建 **Voice Clone**（需遵守服务条款与法律，勿模仿真人用于误导）。
3. 每个声音都有唯一 **Voice ID**，复制到上述对应环境变量即可。

前端在调用 `/api/tts` 时会传 `speakerId`（如 `pro1`、`chair`），服务端会按 `SPEAKER_VOICE_IDS` 选用对应 `voice_id`，从而实现“辩手角色 → 固定嗓音”。

### 2.3 可选：模型

```env
TTS_ELEVEN_MODEL=eleven_multilingual_v2
```

未设置时默认使用 `eleven_monolingual_v1`。

---

## 总结

| 方式           | 能否“还原”角色声音 | 配置难度 |
|----------------|--------------------|----------|
| 浏览器 TTS     | 仅能固定系统嗓音风格 | 低，可改 `SPEAKER_VOICE_PREFERENCES` |
| 外部 TTS (ElevenLabs) | 可选用/克隆更贴近角色的声音 | 需 API Key + 为每个辩手设 `TTS_VOICE_*` |

若希望 Pro 1 听起来更像“特朗普那种声音”，建议使用 **ElevenLabs** 并为 Pro 1 单独选或克隆一个相似风格的 voice_id，并在 `.env` 中设置 `TTS_VOICE_PRO1=该 voice_id`。
