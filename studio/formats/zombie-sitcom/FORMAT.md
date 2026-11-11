# zombie-sitcom — ซอมบี้คอนโด (fiction, serial)

**ซอมบี้คอนโด · English: Zombie Condo** (key `zombie-sitcom`)

Formula: **ซีรีส์ต่อเนื่อง ตลก ตอนละ 1 มุก**
Seen with visual style: `sitcom-toon` (any visual style is allowed). Legacy series name: `zombie-condo`.

## Beats per episode (≈ 30–39 s, ~11 lines, narrator + character dialogue)
Every episode: **show a concrete problem immediately → solve one small mission → show its cost → end on the next decision.**
1. hook: the problem in one line ("บันไดหนีไฟเงียบมาก จนมีเสียงคนเรียกขึ้นมา")
2. mission: the duo (ตั้ม, ป้าบิ่น) try one thing
3. one joke — deadpan exchange between characters ("ป้ายห้ามส่งเสียง ซอมบี้อ่านออกด้วยเหรอ")
4. cost/result shown (battery %, water ml, items gained)
5. cliff: the next decision or new info

## Continuity
- Series bible + `resource-ledger.json` are the source of truth. Never reset inventory, battery or water
  without a visible cause on screen.
- Keep long recaps out of the opening.

## Fact / fiction
Fiction comedy. Water/food amounts are story bookkeeping, **not** preparedness advice; if a real survival tip
appears (e.g. stock water, torch, power bank) keep it ordinary and correct.

## Tone
Light, warm, deadpan; zombies are an obstacle, not gore.

## Captions (content)
Speaker-aware lines; highlight the joke word or the resource number.

## Voice
Local JK `approved-calm-male-v1` (narrator and voiced lines). ElevenLabs only with the owner's own voice `jk`
and spend approval.

## Examples (library, outside repo)
- `~/Studio/clips/2026-10-26_zombie-condo_ep06_fire-stairs-voice/script.md` and `source/series-bible.txt`
- `~/Studio/clips/2026-10-25_zombie-condo_ep01_tomorrow-invasion/script.md`
