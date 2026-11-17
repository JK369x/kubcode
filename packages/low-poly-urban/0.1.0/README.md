# Low-poly Urban (low-poly-urban)

คลิปแนวตั้งเมืองสามมิติแบบ low-poly สร้างจากโค้ด (Three.js) ไม่ใช้ AI สร้างภาพ ไม่ต้องจ่าย API
มีตัวอย่างเมือง 8 วินาทีให้แก้ต่อ และซับไทยไฮไลต์คำสำคัญ + อังกฤษตัวเล็ก

## ติดตั้ง

1. คัดลอก `SKILL.md`, `references/` และ `agents/` ไปไว้ในโฟลเดอร์ skill ของ agent ที่ใช้ เช่น
   `~/.claude/skills/low-poly-urban/` (Claude Code) หรือ `.agents/skills/low-poly-urban/` (OpenCode)
2. เก็บ `example/city` ไว้เป็นต้นแบบโปรเจกต์
3. ติดตั้งเครื่องมือ: Node 18+ และ HyperFrames (`npx hyperframes --help`), FFmpeg

## ใช้งาน

บอก agent ประมาณนี้: “ใช้ low-poly-urban ทำคลิป 9:16 ยาว 20 วินาที เรื่อง ... พร้อมซับไทย”

## ไลเซนส์ในแพ็กเกจนี้

| ไฟล์ | ไลเซนส์ |
|---|---|
| SKILL.md, references/, example/city/index.html, scene.js | MIT (kubcode.dev) — `LICENSE` |
| example/city/assets/three.module.js | MIT (three.js authors) — `example/city/assets/THREE-LICENSE.txt` |
| example/city/assets/fonts/VT323, Chakra Petch | SIL Open Font License 1.1 — ไฟล์ `*-OFL.txt` ข้างฟอนต์ |
| example/city/assets/gsap.min.js | GSAP Standard "No Charge" License (หัวไฟล์) — https://gsap.com/standard-license/ |

รายละเอียด: `KUBCODE-NOTICE.md`
