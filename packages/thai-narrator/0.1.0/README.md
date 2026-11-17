# Thai Narrator (thai-narrator)

สร้างเสียงบรรยายภาษาไทยด้วยเสียงเดียวกันทุกบรรทัด จากไฟล์เสียงตัวอย่างสั้น ๆ ที่คุณอัดเอง
ใช้ VoxCPM2 บน Mac ชิป Apple Silicon ออฟไลน์ได้หลังติดตั้ง ไม่ต้องจ่าย API แพ็กเกจนี้ไม่มีเสียงแถมมา

## ติดตั้ง

1. คัดลอกทั้งโฟลเดอร์ไปไว้ในโฟลเดอร์ skill เช่น `~/.claude/skills/thai-narrator/`
   (Claude Code) หรือ `.agents/skills/thai-narrator/` (OpenCode)
2. ต้องมี Python 3.11+, FFmpeg และ Mac ชิป Apple Silicon
3. อัดเสียงตัวเอง 5–15 วินาที บันทึกเป็น `assets/voice-reference.wav` แล้วพิมพ์ประโยคที่พูดลงใน
   `reference_text` ของ `assets/narrator-profile.json` (ใช้เสียงที่คุณมีสิทธิ์เท่านั้น ห้ามเลียนเสียงคนอื่นโดยไม่ได้รับอนุญาต)
4. ทำตามขั้น Setup ใน `SKILL.md` (ดาวน์โหลดโมเดล VoxCPM2 จาก Hugging Face ตามเงื่อนไขของผู้พัฒนาโมเดล)

## ใช้งาน

บอก agent ประมาณนี้: “ใช้ thai-narrator อ่านบทพากย์นี้ แล้วบอกความยาวแต่ละบรรทัด”

## ไลเซนส์ในแพ็กเกจนี้

| ไฟล์ | ไลเซนส์ |
|---|---|
| SKILL.md, scripts/, ไฟล์ตั้งค่า | MIT (kubcode.dev) — `LICENSE` |
| เสียงตัวอย่าง | ไม่มีในแพ็กเกจ ใช้เสียงของคุณเอง |
| โมเดล VoxCPM2 | ไม่รวมในแพ็กเกจ ดาวน์โหลดเองจาก Hugging Face ตามเงื่อนไขของโมเดล |
