# Stickman Canvas (stickman-canvas)

คลิปแนวตั้ง 9:16 ตัวละครเส้นสีดำแบบภาพยนตร์ วาดด้วยโค้ดทุกเฟรม (Canvas 2D) มีแสงขอบตัว ไฟเวที
ฉากหน้าเบลอ หน้าใหญ่เต็มจอ ฟรีซเฟรม ตัวเลขวิ่ง กราฟแท่ง ไดอะแกรม blueprint และซับไทยไฮไลต์คำสำคัญ
ไม่ใช้ AI สร้างภาพ ไม่ต้องจ่าย API

## ติดตั้ง

1. แตกไฟล์ไว้ในโฟลเดอร์งาน แล้วคัดลอก `SKILL.md` และ `agents/` ไปไว้ในโฟลเดอร์ skill เช่น
   `~/.claude/skills/stickman-canvas/` (Claude Code) หรือ `.agents/skills/stickman-canvas/` (OpenCode)
2. ติดตั้ง Node 20+ และ FFmpeg แล้วรันในโฟลเดอร์งาน: `npm install && npx playwright install chromium`
3. ทดสอบ: `npm run sheet` (ได้ภาพนิ่ง 4 ภาพในโฟลเดอร์ `out/`)

## ใช้งาน

บอก agent ประมาณนี้: “ใช้ stickman-canvas ทำคลิป 9:16 ยาว 20 วินาที เรื่อง ... ตัวละคร 2 คน พร้อมซับไทย”

## ไลเซนส์ในแพ็กเกจนี้

| ไฟล์ | ไลเซนส์ |
|---|---|
| engine/, example/, render.mjs, SKILL.md | MIT (kubcode.dev) — `LICENSE` |
| fonts/Anuphan | SIL Open Font License 1.1 — `fonts/Anuphan-OFL.txt` |

รายละเอียด: `KUBCODE-NOTICE.md`
