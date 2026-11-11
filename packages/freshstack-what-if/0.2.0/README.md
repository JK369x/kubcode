# What If Lab 0.2.0 (kubcode.dev package)

Vertical (9:16) Thai "What If" shorts: one question in, a 30–40 s animated episode out. Every frame is SVG drawn in
code (Remotion); narration is ElevenLabs with **your own voice**. Based on the What If animation skill by FreshStack
(MIT, `LICENSE`); see `KUBCODE-NOTICE.md` for what kubcode added.

| Folder | What |
|---|---|
| `SKILL.md`, `references/`, `scripts/` | the upstream skill kit (brief for the agent, look, sound, traps; `scripts/voice.py` etc.) |
| `README-upstream.md` | the upstream README |
| `studio/` | Remotion project with the engine and one sample episode (`bees-vanish`, code only, no audio) |
| `host/` | host pipeline: timing from real narration, registration, QA stills, contact sheet, cover |
| `voice/` | `narrate_elevenlabs.py`: one 48 kHz wav per line + `audio_meta.json`, voice looked up by name |
| `check.sh` | checks Node, ffmpeg, Python, Chrome and your settings; installs nothing |

## Setup

macOS: `brew install node ffmpeg python@3.12`. Windows: use WSL2 Ubuntu 24.04 (`wsl --install -d Ubuntu-24.04`) and,
inside it, Node 24 via nvm, then
`sudo apt install -y ffmpeg python3-venv libnss3 libatk-bridge2.0-0t64 libgbm1 libxkbcommon0 libasound2t64`. Keep the
folder inside the Linux filesystem (`~/`), not `/mnt/c`. Linux: the same apt line.

```bash
python3 -m pip install numpy Pillow
cd studio && npm ci && npx remotion browser ensure && cd ..
sh check.sh
```

Put your settings in a `.env` file in this folder (never paste the key into a chat):

```
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_NAME=<the exact name of your voice in ElevenLabs → Voices>
```

There is no default voice: the scripts stop if the name is missing, matches no voice, matches two, or is a stock
premade voice. Always run a dry run first; it calls nothing and prints the character count.

## Make an episode

Open your agent (Claude Code or OpenCode) in this folder and paste:

Make a vertical Thai What If episode with this package: what if all bees vanished tomorrow?

The agent follows `SKILL.md` and writes `studio/src/episodes/<slug>/` (`SCRIPT.md`, `cues.json`, `shots.tsx`,
`index.tsx`), using `bees-vanish` as the model. Then, step by step:

```bash
set -a; . ./.env; set +a
python3 voice/narrate_elevenlabs.py --lines lines.json --out work/voice/<slug>/voice --dry-run
python3 voice/narrate_elevenlabs.py --lines lines.json --out work/voice/<slug>/voice     # paid; prints credits used
sh host/host_integrate.sh <slug>                  # timing, READY, typecheck, QA stills strip
(cd studio && node render.mjs <CompositionId> ../work/deliverables/<slug>.mp4)
sh host/host_qa.sh <slug>                         # streams, loudness, decode, contact sheet
python3 host/make_cover.py <slug> <frame> "<kicker>" "<headline 1>" "<headline 2>" "<question>" work/deliverables/<slug>-cover.jpg
```

`lines.json` is `[{"id": "l1", "text": "..."}, …]`, the Thai lines of the episode's `SCRIPT.md`. The composition id is
the slug in PascalCase (`bees-vanish` → `BeesVanish`). To try the sample first, narrate `bees-vanish` (its lines are in
`studio/src/episodes/bees-vanish/SCRIPT.md`).

Paths can be moved with `WHATIF_STUDIO`, `WHATIF_WORK`, `WHATIF_VOICE_DIR` and `CHROME`.

## Rights

Code: MIT (FreshStack; kubcode additions MIT too). Fonts: SIL OFL (Chakra Petch, IBM Plex Sans Thai; licences next to
the files). Remotion has its own licence (free for individuals and small teams; check remotion.dev/license).
ElevenLabs output follows your ElevenLabs plan. Check facts before publishing; the sample's claims are illustrative.
