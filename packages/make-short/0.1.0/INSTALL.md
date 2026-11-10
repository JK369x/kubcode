# Install make-short (v3, Blender engine)

> **Claude Code only.** This skill runs Blender, Node and ffmpeg on your own computer, so it does not work as a claude.ai Skills upload (the folder is also too large for it). Install it in Claude Code with the steps below.


## Prerequisites
| Tool | Version | Install |
|---|---|---|
| Blender | 5.2 (5.x; the scripts use the Blender 5 compositor API) | https://www.blender.org/download/ , default path `C:\Program Files\Blender Foundation\Blender 5.2\`. Elsewhere: set `$env:BLENDER` to the full path of blender.exe |
| Git Bash | any (the .sh scripts run in it) | comes with Git for Windows: `winget install Git.Git` |
| Node.js | 22 or newer | `winget install OpenJS.NodeJS.LTS` |
| ffmpeg + ffprobe | any recent, on PATH | `winget install Gyan.FFmpeg` |
| Python 3 | 3.10+, as `python` on PATH | `winget install Python.Python.3.12` |
| Python packages | pillow, numpy | `python -m pip install pillow numpy` (only used if textures must be regenerated; gate.py needs only ffmpeg) |
| Whisper (free voice route only) | any | `python -m pip install openai-whisper` |
| GPU | an NVIDIA/AMD GPU Blender can use (EEVEE) | a 60 s film is about 21 min on a gaming laptop; CPU-only is far slower |

Optional: ElevenLabs key (`$env:ELEVENLABS_API_KEY`, set in your own terminal, never in chat) for a generated voice and sound effects; Blotato key only for auto-posting. Nothing else needs a key.

## Install the skill
**Easiest:** open Claude Code and paste: `Install the skill from https://github.com/nocodehack/make-short into my Claude Code skills folder`. Claude downloads and installs it. Then restart Claude Code.

Or by hand, in PowerShell:
```
git clone https://github.com/nocodehack/make-short
Copy-Item -Recurse -Force .\make-short "$env:USERPROFILE\.claude\skills\make-short"
```
No git? On GitHub click **Code > Download ZIP**, unzip it, rename `make-short-master` to `make-short`, and run the `Copy-Item` line from the folder that contains it.
Close and reopen Claude Code, then type `/make-short <your idea>`.
(If the skill already exists and you want to keep it: rename the old folder first.)

## Most common error and the fix
**Symptom:** `Blender 5.x not found. Install it or set BLENDER=...` (or `python: command not found` / `ffmpeg: command not found` in gate.sh).
**Cause:** Blender installed in a non-default folder, or the terminal was opened before winget finished, so PATH is stale.
**Fix:** close ALL terminals and open a new one; check `ffmpeg -version`, `python --version`, `node --version`. For Blender in another folder: `$env:BLENDER = "D:\Apps\Blender 5.2\blender.exe"` (PowerShell) before running; Git Bash: `export BLENDER="/d/Apps/Blender 5.2/blender.exe"`.

Second most common: scripts run from the skill folder instead of the project copy. Always `Copy-Item -Recurse "SKILL\v3" <project>` and work in the copy.
