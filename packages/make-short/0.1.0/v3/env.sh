# sourced by every script: sets HERE (project folder) and BL (Blender 5.x path). Override with BLENDER=/path/to/blender.exe
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "$BLENDER" ]; then BL="$BLENDER"
else BL="$(ls -d "/c/Program Files/Blender Foundation/Blender 5."*/blender.exe 2>/dev/null | sort -V | tail -1)"; fi
[ -x "$BL" ] || { echo "Blender 5.x not found. Install it or set BLENDER=/path/to/blender.exe"; exit 1; }
