# Windows troubleshooting

Start with `node "<SKILL>\scripts\doctor.mjs"`. It checks everything below and prints the exact fix. After installing anything, **close the terminal and open a new one**: Windows only reads the new PATH in a new window.

| what you see | why | fix |
|---|---|---|
| `'node' is not recognized` or "Node 22 or newer is needed" | Node is missing or old | `winget install OpenJS.NodeJS.LTS`, then a new terminal (or install the LTS from nodejs.org) |
| `ffmpeg not found` / `ffprobe not found` | ffmpeg is missing or not on PATH | `winget install Gyan.FFmpeg`, then a new terminal; `ffmpeg -version` must work |
| `No Chrome or Edge found` | no browser in the usual folders | `winget install Google.Chrome`, or point at yours. PowerShell: `$env:CHROME_PATH="C:\path\chrome.exe"`; cmd: `set CHROME_PATH=C:\path\chrome.exe` |
| `Chrome did not start` | a stuck headless Chrome from a crashed run | close only ours with the command under "Stuck Chrome" below (your normal Chrome stays open) |
| a red **FAILED: name** panel in a video or still | the scene or style code threw an error | the console shows `[style-error] name: ...` with the line; fix that file, then render again |
| `EBUSY` / `EPERM` when rendering again | the mp4 is open in a video player | close the player, then render again |
| render is very slow, doctor says "software 3D" | headless Chrome got no GPU (laptop on battery, power saving) | plug in the charger; Windows Settings > Display > Graphics: set Chrome to High performance; or pick a 2D style |
| files vanish or are locked in Documents/Desktop | OneDrive sync or Controlled Folder Access | keep Shorts in a plain folder such as `C:\shorts` or `D:\shorts` |
| a path with spaces breaks a command | the path is not in quotes | put every path in double quotes, as SKILL.md does |
| `Cannot use import statement outside a module` | `package.json` is missing from the project | copy `package.json` from the skill's `engine` folder into the project |
| Windows Firewall asks about node.exe | not needed: the engine only talks to itself on 127.0.0.1 | click Cancel; rendering still works |

## Stuck Chrome
In PowerShell, this closes only the headless Chrome that make-short started:
```
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*make-short-chrome-*' } | ForEach-Object { Stop-Process -Id $_.ProcessId }
```

Still stuck? Copy the last 20 lines of the error into Claude Code and say "fix this". Never paste API keys anywhere: this skill needs none.
