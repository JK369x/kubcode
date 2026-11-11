# Story formats — how the story is told

Owner decision 2026-11-10: a clip is **one visual style + one story format**. This folder holds the
*story* axis only: script formula, beats, length, tone, fact vs fiction, content rules for captions,
voice. How the clip *looks* (kit, renderer, palette, characters) lives in [`../visual/`](../visual/README.md).
Keys come from `~/Studio/taxonomy.json` (`story_formats`) and must not be renamed.
Kit authors (upstream credits) are never format names.

| key | ไทย | English | kind | formula (from taxonomy) | real clips | pairs seen so far |
|---|---|---|---|---|---|---|
| [know-to-survive](know-to-survive/FORMAT.md) | รู้ไว้รอด | Know to Survive | fact | สถานการณ์อันตรายใกล้ตัว → สัญญาณเตือน → วิธีรอด → เบอร์ฉุกเฉิน | 2 | flat-room |
| [ghost-story](ghost-story/FORMAT.md) | เรื่องผี | Ghost Story | fiction | ฮุกเวลา/สถานที่ → เหตุแปลกซ้ำ → หักมุม → บอกว่าเป็นเรื่องแต่ง | 5 | night-vector |
| [map-fact](map-fact/FORMAT.md) | เรื่องแผนที่ | Map Facts | fact | ข้อเท็จจริงแปลกเกี่ยวกับสถานที่ → เทียบกับสิ่งที่คนไทยรู้จัก → แหล่งอ้างอิง | 5 | satellite-map |
| [what-if](what-if/FORMAT.md) | ถ้าเกิดว่า… | What If | fiction+fact | สมมติ 1 ข้อ → ผลลัพธ์ทีละขั้น → ข้อเท็จจริงจริง 1 ข้อ → คำถามปิด | 11 | stick-svg |
| [life-story](life-story/FORMAT.md) | เรื่องชีวิต | Life Story | fiction | ปัญหาใกล้ตัว → ความรู้สึก → ทางออกเล็กๆ ทำได้วันนี้ | 5 | soft-2d |
| [behind-the-city](behind-the-city/FORMAT.md) | เบื้องหลังเมือง | Behind the City | fact | สิ่งที่เห็นทุกวัน → เบื้องหลังจริง → ตัวเลข 1 ตัว | 3 | low-poly |
| [money-tip](money-tip/FORMAT.md) | เงินทองง่ายๆ | Money Tips | fact | ปัญหาเงิน → กฎ 1 ข้อ → ตัวอย่างตัวเลข | 3 | stickman-canvas |
| [zombie-sitcom](zombie-sitcom/FORMAT.md) | ซอมบี้คอนโด | Zombie Condo | fiction | ซีรีส์ต่อเนื่อง ตลก ตอนละ 1 มุก | 7 | sitcom-toon |
| [outbreak-drama](outbreak-drama/FORMAT.md) | ห้างติดเชื้อ | Mall Outbreak | fiction | ซีรีส์ต่อเนื่อง ระทึก | 2 | low-poly |
| [satire](satire/FORMAT.md) | เสียดสี | Satire | fiction | สมมติเกินจริงเกี่ยวกับคนดัง → บอกว่าเป็นเรื่องแต่ง | 1 | low-poly |
| [deep-dive-doc](deep-dive-doc/FORMAT.md) | สารคดีสั้น | Mini Doc | fact | ปริศนา → ข้อเท็จจริงทีละชั้น → แหล่งอ้างอิง | 1 | deep-sea |
| [tool-from-podcast](tool-from-podcast/FORMAT.md) | เครื่องมือจากพอดแคสต์ | Tool from Podcast | fact | ตัดช่วงอธิบายเครื่องมือ → ซับไทย → เครดิตต้นทาง | 4 | footage-reframe |
| [celebrity-quote](celebrity-quote/FORMAT.md) | คำพูดคนดัง | Celebrity Quote | fact | คำพูดจริง 1 ประโยค → บริบท → ซับไทย | 9 | footage-reframe |
| [mystery](mystery/FORMAT.md) | ปริศนา | Mystery | fact | คำถามชวนสงสัย → เบาะแส → คำตอบ | 1 | footage-reframe |

Clip counts are from `~/Studio/clips/*/clip.json` (`story_format` field) on 2026-11-10. All 14 formats have
at least one real clip, so all 14 have a FORMAT.md.

## Rules shared by every format

**Voice.** Default narrator is the local VoxCPM2 Thai narrator `approved-calm-male-v1`
(`shared/voice/scripts/narrate.py`, offline, no spend). ElevenLabs Thai is allowed **only** with the owner's
own ElevenLabs voice `jk`, and only after explicit spend approval for that exact run. No premade/stock
ElevenLabs voice, no edge-tts / macOS `say` as a production voice, no silent substitution. Footage formats
keep the original speaker's audio. Keep natural speed and pitch: if the read is too long, cut words, never
speed up the audio.

**Length.** Shorts are 9:16, 1080×1920. The real clips cluster at ~30–45 s. Thai narrator measured on the
2026-11-01 batch: ≈ 10–12 Thai characters per second of finished clip including pauses (e.g. 513 chars →
42.8 s, 372 chars → 35.0 s). Time everything from the real audio (`audio_meta.json`), never from estimates.

**Hook.** Frame 0 already shows the situation; the first line is said within ~0.3 s; no greeting, no
empty title card.

**Captions (content).** Thai primary, one short phrase per cue, exactly one meaningful highlighted
word/phrase; small uppercase English translation below that is faithful and adds nothing. Highlight colour
carries meaning: amber = key info/number, coral = threat/prohibition/mistake, cyan = clue/alternative/reframe.
Captions follow the actual spoken words; never stretch speech to fit captions. Fonts, sizes, outlines and
placement are *look* and come from [`shared/captions/STYLE.md`](../shared/captions/STYLE.md) and the visual
style.

**Facts.** Every number and real-world claim in a fact (or fiction+fact) format needs a source or a worked
calculation written in the script under a "Facts / แหล่งที่มา" section. Hedge (มัก / อาจ / ราว) when a claim is
a general practice, not a measurement. If web verification was not possible, say so in the script.

**Fiction.** Fiction formats say so on screen and/or in the closing line ("เรื่องนี้เป็นเรื่องแต่ง").
No real private people, brands or places presented as the setting of invented events.

**Script file.** Each project keeps a `SCRIPT.md` with: line table (id, Thai, English), beats/shots,
facts/sources, sound notes. Exact spoken text lives in `lines.json`.
