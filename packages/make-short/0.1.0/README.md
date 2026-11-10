<div align="center">

# 🎬 make-short

### Make animated YouTube Shorts with Claude Code

Cartoon characters in a 3D world, a voice, captions and sound, built in **Blender with code**,<br>
then scored by a **fresh critic agent** so you know exactly what to fix.

<img src="assets/demo.gif" width="260" alt="A Short made with make-short: a bean soldier in a painted 3D army camp">

**Free · MIT · runs on your own PC · never posts without you**

[▶️ Watch the full tutorial](https://www.youtube.com/watch?v=gH__ujN5Joo) · [⚙️ Install](#-install) · [🧭 How it works](#-how-it-works) · [❓ FAQ](#-faq)

</div>

---

## ✨ Before → after

The first full render passed every automatic check and still looked like a horror movie. A fresh critic scored it **4.2 / 10**. After critic-driven fix rounds the same Short scored **7.9 / 10**.

<table>
<tr>
<th align="center">❌ First render: critic 4.2</th>
<th align="center">✅ After the fix rounds: critic 7.9</th>
</tr>
<tr>
<td align="center"><img src="assets/before-first-render.png" width="300" alt="First render: magenta night, red ground"></td>
<td align="center"><img src="assets/after-final.png" width="300" alt="Final render: sunny camp, readable character"></td>
</tr>
</table>

<p align="center"><img src="assets/score-climb.png" width="720" alt="Critic score per round, 4.2 to 7.9"></p>

---

## 🧭 How it works

<p align="center"><img src="assets/pipeline.png" width="820" alt="Measure, voice, build, critic, post, with a loop from critic back to build"></p>

| Step | What Claude does | You do |
|---|---|---|
| **1. Measure** | Breaks a Short you love into numbers (shots, locations, colour, brightness) and its story into steps | Pick the reference |
| **2. Story** | Writes a paradox story: hook, escalation, "You see…", payoff, twist. Fact-checks the real history | **Approve** the story |
| **3. Voice** | Uses your own recording (free) or ElevenLabs, then times every word. The voice is the clock | Record, or set your own key |
| **4. Build** | Writes the shots, acting and Blender scenes with code. Big Shorts use a team of agents with a `CONTRACT.md` | Approve the plan |
| **5. Gate** | Renders a still per shot and checks it by numbers **and** by eye | Say "render" |
| **6. Critic** | A **fresh** critic agent scores the render against a rubric, with the exact second of every lost point | Check its notes |
| **7. Fix** | Fixes only the confirmed problems, renders again | Repeat until you're happy |
| **8. Post** | Optional: Blotato posts it **private**, after showing you exactly what it will send | Type **go** |

<table>
<tr>
<td width="50%"><img src="assets/team.png" alt="Opus manager with four Sonnet workers: look, char, world, shots"><br><sub><b>A team of agents.</b> Opus manages, four Sonnet workers build the look, the characters, the world and the shots.</sub></td>
<td width="50%"><img src="assets/critic.png" alt="Claude grades its own work 6.5, a fresh critic grades the same render 4.2"><br><sub><b>Never trust a self-score.</b> Claude gave its own work 6.5. A fresh critic gave the same render 4.2.</sub></td>
</tr>
<tr>
<td width="50%"><img src="assets/voice.png" alt="1,015 characters, about 1,000 ElevenLabs credits per take"><br><sub><b>Know the voice cost first.</b> ElevenLabs is about 1 credit per character; the skill tells you the count before generating.</sub></td>
<td width="50%" align="center"><img src="assets/live-hardtack.png" width="200" alt="Live run: a 15-second Short about Civil War hardtack"><br><sub><b>Live test from zero.</b> One idea (Civil War "tooth dullers") → a finished 15 s Short in about 30 min. First critic score 6.2.</sub></td>
</tr>
</table>

---

## ⚙️ Install

> **Claude Code only.** This skill runs Blender, Node and ffmpeg on your own computer, so it does not work as a claude.ai Skills upload (the folder is also too large for it). Install it in Claude Code as shown below.

**You need** (Windows, the scripts run in Git Bash):

| Tool | Version | Install |
|---|---|---|
| Claude Code | latest | [claude.com/claude-code](https://claude.com/claude-code) |
| Blender | 5.x | [blender.org/download](https://www.blender.org/download/) |
| Node.js | 22+ | `winget install OpenJS.NodeJS.LTS` |
| Python | 3.10+ | `winget install Python.Python.3.12` |
| ffmpeg | recent, on PATH | `winget install Gyan.FFmpeg` |
| Git Bash | any | `winget install Git.Git` |
| Whisper (free voice route) | any | `python -m pip install openai-whisper` |
| GPU | one Blender can use (EEVEE) | a 60 s film renders in about 21 min on a gaming laptop |

**Easiest:** open Claude Code and paste: `Install the skill from https://github.com/nocodehack/make-short into my Claude Code skills folder`. Claude downloads and installs it. Then restart Claude Code.

**Or by hand** (PowerShell):

```powershell
git clone https://github.com/nocodehack/make-short
Copy-Item -Recurse -Force .\make-short "$env:USERPROFILE\.claude\skills\make-short"
```

Reopen Claude Code, then type:

```
/make-short a 15 second Short about why soldiers called hardtack "tooth dullers"
```

Full details, and the fix for the most common error, are in [INSTALL.md](INSTALL.md). Run section A of [CHECKLIST.md](CHECKLIST.md) once on a new PC.

---

## 💸 What it costs

Real numbers from the live 15-second run:

- **Claude:** 26 minutes of work used about **3%** of a 5-hour limit and **1%** of the weekly limit on the Max 5x plan, about **$5** at API prices. On Pro, expect roughly five times that share of your limits.
- **Voice:** free if you record yourself. ElevenLabs used **202 credits** for the 15 s narration.
- **Extra fix rounds** are where most of the usage goes, so how far you push is your choice.

---

## 🛡️ Built-in rules

- **Nothing is posted** unless you type `go`. Uploads go out **private** first.
- **API keys never touch the chat.** They live in your own terminal (`$env:ELEVENLABS_API_KEY`, `$env:BLOTATO_API_KEY`).
- **No self-scoring.** Only an independent critic scores, and every lost point comes with a timestamp you can check.
- **Honest claims.** The skill never says "one prompt" or "fully automatic": you approve the story, the plan and the render.
- **Original characters only:** a generic world, no borrowed IP.
- **It learns.** Every mistake becomes a written rule in [`references/lessons.md`](references/lessons.md), so the next Short starts smarter.

---

## 📁 What's inside

```
make-short/
├── SKILL.md           the steps Claude follows
├── INSTALL.md         prerequisites + install
├── CHECKLIST.md       first-run checks
├── references/        story rules, character rules, lessons, contract + brief examples
├── v3/                the Blender engine (scenes, characters, shots, gate, render, voice, critic rubric)
│   └── example-60s/   a complete 60 s example project (story, contract, shots, acting)
├── scripts/           voice, posting (Blotato), QA helpers
└── engine/ template/  the legacy 2D route
```

---

## ❓ FAQ

**Can I upload it to claude.ai Skills?** No. It runs Blender and scripts on your computer, so it needs Claude Code (desktop app or terminal). Open Claude Code and ask it to install the skill from this repo's link (see [Install](#-install)).

**Can I make Shorts on my phone?** No. Blender runs on a computer (Windows for these scripts).

**Do I need to know Blender?** No. Claude writes the Blender Python scripts. You only look at the stills and the render.

**Can I use my own voice?** Yes, and it's the default (free). Record the narration and the skill times every word locally with Whisper.

**How good is the first try?** Our live run started at a critic 6.2 in about 30 minutes. Each critic and fix round on top improves it; the can Short climbed from 4.2 to 7.9.

**Does it post for me?** Only if you connect Blotato and type `go`. It shows the exact post first and uploads it as private.

**Mac or Linux?** It's built and tested on Windows. The Blender and Node parts are cross-platform, but the paths and scripts assume Windows + Git Bash.

---

<div align="center">

Made by **[NoCodeHack](https://www.youtube.com/channel/UCRiXX3JVd24ruHmERlncnjQ)** · MIT License · third-party credits in [THIRD-PARTY.md](THIRD-PARTY.md)

</div>

---

## ภาษาไทย (kubcode.dev)

skill นี้ใช้กับ Claude Code ทำคลิปสั้นแอนิเมชัน 3D ด้วย Blender ตัวละครทรงเมล็ดถั่วในโลกที่วาดด้วยโค้ด มีเสียงพากย์ ซับ และเสียงประกอบ แล้วให้ agent อีกตัวให้คะแนนและบอกจุดที่ต้องแก้

1. แตกไฟล์ไว้ที่ `~/.claude/skills/make-short/`
2. ติดตั้ง Blender 5.x, Node 22+, Python 3.10+ (pillow, numpy) และ ffmpeg
3. บน Mac: อ่าน `KUBCODE-NOTICE.md` แล้วรัน `kubcode/mac-patch.sh` กับโฟลเดอร์โปรเจกต์
4. เปิด Claude Code แล้วพิมพ์:

```
/make-short a 15 second Short about why ice floats on water
```
