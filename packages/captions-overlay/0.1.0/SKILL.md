---
name: captions-overlay
description: Add Thai-first captions with one highlighted keyword and a smaller uppercase English line to a vertical clip, as HyperFrames caption clips or a burned-in FFmpeg ASS subtitle. Use when the user wants Thai + English keyword captions, "captions overlay", or subtitles timed to narration.
---

# Captions Overlay — Thai + English keyword highlight

Values: `references/thai-en-keyword-highlight.json` (fonts, sizes, colours, motion). Preview of the look:
`references/preview.jpg`. Font: `fonts/ChakraPetch-SemiBold.ttf` (OFL).

## Rules
- Thai is primary: one short phrase, cream/white text, dark outline, ONE meaningful highlighted word or
  phrase. Never colour the whole sentence or every word.
- English is a smaller, faithful, uppercase translation directly beneath. Don't add English narration.
- Highlight colours: amber = key information, coral = threat/forbidden, cyan = clue/alternative route.
- At 1080×1920: Thai 65 px, English 30 px, Thai outline 5 px. Scale with resolution.
- Place around faces, props, signs and platform UI; no blank subtitle band.
- Motion: 140 ms entrance, 180 ms keyword settle from 1.06 scale. No bounce, no word explosions, no popup cards.
- Time cues to the real narration (e.g. `audio_meta.json` from `thai-narrator`); phrase-level timing is fine,
  don't fake word alignment, don't stretch speech.

## Option A — HyperFrames
One caption clip per phrase: a `.clip` element with `data-start`/`data-duration` on a captions track,
Thai line + `<span class="kw">` for the keyword + an English line. Style from the JSON values.

## Option B — FFmpeg burn-in (any video)
1. Write an `.ass` file: PlayResX 1080, PlayResY 1920; style "TH" (Chakra Petch SemiBold 65, primary
   &H00F0FAFF, outline &H0015100B width 5); style "EN" (size 30). Colour the keyword with an inline
   `{\c&H...&}` override using the JSON's highlight colour, then reset `{\r}`.
2. Burn in with the bundled font dir:
   `ffmpeg -i in.mp4 -vf "subtitles=captions.ass:fontsdir=fonts" -c:a copy out.mp4`
3. Check frames at each cue for collisions with faces/UI before publishing.
