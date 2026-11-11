# know-to-survive — รู้ไว้รอด (fact)

**รู้ไว้รอด · English: Know to Survive** (key `know-to-survive`)

Formula: **สถานการณ์อันตรายใกล้ตัว → สัญญาณเตือน → วิธีรอด → เบอร์ฉุกเฉิน**
Seen with visual style: `flat-room` (any visual style is allowed). Legacy series name: `thai-survival`.

## Beats (≈ 40–45 s, 8–10 lines)
| # | beat | what it does |
|---|---|---|
| 1 | hook (0–3 s) | "ถ้า[คุณ/เพื่อน]…[สถานการณ์ใกล้ตัวคนไทย]" + "อย่าเพิ่ง[สิ่งที่สัญชาตญาณบอก]" — second person |
| 2 | name it | what it really is, why it is dangerous (one line) |
| 3 | warning signs | 3–5 concrete signs, listed |
| 4–6 | how to survive | numbered actions, each one picture; one prohibition (ห้าม…) in coral |
| 7 | emergency number | spoken in words, shown in digits, pressed on a phone (1669 แพทย์ฉุกเฉิน, 191 ตำรวจ, 1441 AOC …) |
| 8 | close | one calm rule to remember; no cliffhanger |

Thai places that people know (สงกรานต์, คอนโด, ตึกแถว, หมู่บ้าน) beat generic international settings.

## Length / words
Target 40–45 s; real clips 41.2 s (460 chars) and 42.8 s (513 chars). Budget ≈ 450–520 Thai characters.
Short, clipped sentences. Numbers in `lines.json` are written as words (หนึ่งหกหกเก้า).

## Tone
Calm, serious, practical. No jokes (the upstream channel analysis shows comedy versions fail). Tension comes
from the situation, not from gore or fear-mongering.

## Facts
- This is safety advice: **every number, symptom, first-aid step and hotline must be verified** against an
  official source (สพฉ., สตช., กระทรวงสาธารณสุข, AOC) and listed under "แหล่งที่มาของข้อเท็จจริง".
- If verification could not be done in that session, the script must say so and the clip is not
  publish-ready until checked (both 2026-11-01 clips carry that note).
- Amounts on screen that are only examples (e.g. ฿250,000) are labelled as examples, not statistics.
- The old 68 s fictional "ถ้า… คุณจะรอดไหม" series shape (animal sidekick, clue, cliffhanger) from the
  upstream kit is **not** this format; it is a fiction teaser. This format gives real advice.

## Captions (content)
One phrase per cue; coral highlight for prohibitions and the danger itself (ห้ามกรอกน้ำ, หลอกให้โอน);
amber for numbers and hotlines; at most ~6 coral cues per clip so warnings stay strong.

## Voice
Local JK `approved-calm-male-v1` by default. ElevenLabs Thai only with the owner's own voice `jk` and explicit
spend approval (the upstream kit's ElevenLabs "George" default does not apply).

## Examples (read, do not copy)
- `outputs/shorts-2026-11-01/thai-survival/04-call-center-scam/SCRIPT.md` — scam call, 191/1441.
- `outputs/shorts-2026-11-01/thai-survival/02-heatstroke-songkran/SCRIPT.md` — heatstroke, 1669.
- Upstream story-formula notes (credit only): `media/archive/reference-kits/thai-survival/kit/references/story-formula.md`.
