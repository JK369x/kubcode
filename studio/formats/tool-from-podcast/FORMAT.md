# tool-from-podcast — เครื่องมือจากพอดแคสต์ (fact, real footage)

**เครื่องมือจากพอดแคสต์ · English: Tool from Podcast** (key `tool-from-podcast`)

Formula: **ตัดช่วงอธิบายเครื่องมือ → ซับไทย → เครดิตต้นทาง**
Seen with visual style: `footage-reframe` (any visual style is allowed). Legacy series name: `tech-podcast`.

## Shape (≈ 19–47 s)
1. pick one segment where the hosts explain one tool/news item (what it does, who it is for)
2. cut to a self-contained 20–45 s span; do not reorder speech to change meaning
3. Thai captions translate faithfully what is said; no added claims in the speaker's mouth
4. end with credit to the show/episode and the tool's official link in the description

## Rights / facts
- Check the source licence before cutting (e.g. Jupiter Broadcasting CC BY-SA 4.0 vs older BY-NC pages);
  record it in `LICENSE-REVIEW.md`. Attribution + share-alike are content requirements.
- Evidence images must be frames from the source episode or the tool's real UI, never fabricated UI.
- Security/version claims: link the official advisory; say "เช็กอัปเดต" not "ปลอดภัยแล้ว".

## Voice
Original speaker audio (no narration). If narration is ever added: local JK `approved-calm-male-v1`;
ElevenLabs only with the owner's own voice `jk` and spend approval.

## Captions (content)
Faithful Thai translation, 1–2 lines per cue, timed to the actual speech (ASR-checked).

## Examples (library, outside repo)
- `~/Studio/clips/2026-10-26_tech-podcast_ep02_clean-your-tv/` (`captions.srt`, `source/LICENSE-REVIEW.md`)
- `~/Studio/clips/2026-10-25_tech-podcast_ep01_cliparr/`
