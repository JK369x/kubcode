# Windows PC setup (WSL2 Ubuntu) for the studio pipelines

Target: a Windows 10/11 PC making What If shorts with ElevenLabs narration (local VoxCPM needs Apple Silicon and
is not used here). Everything runs inside WSL2 Ubuntu 24.04; keep the checkout in the Linux filesystem
(`~/work/kubcode`), not under `/mnt/c`, or Remotion and FFmpeg run slowly.

## 1. WSL2 + Ubuntu

PowerShell (admin): `wsl --install -d Ubuntu-24.04`, reboot, create the Linux user. Then in Ubuntu:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl unzip build-essential ffmpeg python3 python3-venv python3-pip fonts-thai-tlwg
```

Ubuntu 24.04 ships Python 3.12, which is what the scripts need.

## 2. Node 24

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
exec $SHELL
nvm install 24 && nvm alias default 24
node -v   # v24.x
```

## 3. Chrome dependencies (Remotion, HyperFrames, cover screenshots)

Remotion downloads its own `chrome-headless-shell` for Linux on first render. It needs these shared libraries:

```bash
sudo apt install -y libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2t64
```

`make_cover.py` finds a Chrome by itself: `$CHROME`, then the HyperFrames, Remotion or Puppeteer downloads, then a
system `chromium`/`google-chrome`. To fetch one explicitly, run `npx remotion browser ensure` inside the Remotion project.

## 4. Python packages

```bash
python3 -m venv ~/.venvs/studio && . ~/.venvs/studio/bin/activate
pip install numpy Pillow
```

numpy is used by the What If kit (`voice.py`, `master.py`); Pillow by the board/still helpers. The ElevenLabs line
helper (`shared/voice/scripts/narrate_elevenlabs.py`) needs only the standard library plus FFmpeg.

## 5. Repo, studio and the Remotion project

```bash
git clone https://github.com/JK369x/kubcode.git ~/work/kubcode && cd ~/work/kubcode
npm --prefix studio test && npm --prefix studio run check
(cd studio/styles/freshstack-what-if/source/studio && npm ci)
```

## 6. ElevenLabs (your own voice, by name)

Create `~/work/kubcode/.env` (git-ignored; never paste the key into a chat):

```
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_NAME=<the exact name of YOUR voice in ElevenLabs → Voices>
```

The helpers look the voice up by that name via `GET /v1/voices` and stop if it is missing, ambiguous or a stock
premade voice. There is no default voice. Always do a `--dry-run` first: it prints the character count and calls
nothing. A real run prints the credits it used.

## 7. OpenCode (GLM episodes)

```bash
curl -fsSL https://opencode.ai/install | bash
opencode auth login          # pick the provider; the free GLM model needs no key
```

The kit's `SKILL.md` (`studio/styles/freshstack-what-if/kit/`) is the brief for the agent writing a new episode.

## 8. What comes from `media/` (copy from the owner's store; never commit)

See `docs/media.md`. For What If shorts you need none of it: narration is generated per episode into
`media/work/what-if/voice/<slug>/voice/`. Optional: `media/studio-examples/` (example videos for the gallery) and
`media/studio-examples/freshstack-what-if/source/studio/public/mute-touch/` (only to re-render Mute Touch).

## 9. Smoke test

```bash
cd ~/work/kubcode
python3 studio/pipelines/what-if-host/host_root.py
(cd studio/styles/freshstack-what-if/source/studio && npx tsc --noEmit && node stills.mjs BeesVanish /tmp/still 60)
```

`/tmp/still/f60.png` should show the garden shot with Thai captions.
