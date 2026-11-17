# Captions Overlay (captions-overlay)

ซับไทยเป็นหลัก ไฮไลต์คำสำคัญคำเดียว มีอังกฤษตัวเล็กข้างใต้ ใช้กับ HyperFrames หรือฝังลงวิดีโอด้วย FFmpeg

## ติดตั้ง

1. คัดลอกทั้งโฟลเดอร์ไปไว้ในโฟลเดอร์ skill เช่น `~/.claude/skills/captions-overlay/`
   (Claude Code) หรือ `.agents/skills/captions-overlay/` (OpenCode)
2. ต้องมี FFmpeg (ถ้าจะฝังซับลงไฟล์) หรือ HyperFrames (`npx hyperframes --help`)

## ใช้งาน

บอก agent ประมาณนี้: “ใช้ captions-overlay ใส่ซับไทยไฮไลต์คำสำคัญ + อังกฤษ ให้คลิปนี้ ตามไฟล์เสียงพากย์”

## ไลเซนส์ในแพ็กเกจนี้

| ไฟล์ | ไลเซนส์ |
|---|---|
| SKILL.md, references/ | MIT (kubcode.dev) — `LICENSE` |
| fonts/ChakraPetch-SemiBold.ttf | SIL Open Font License 1.1 — `fonts/ChakraPetch-OFL.txt` |
