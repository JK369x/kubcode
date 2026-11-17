# Thai Calm Narrator (thai-narrator)

เสียงบรรยายภาษาไทยโทนสุขุม เป็นเสียงสังเคราะห์ที่ออกแบบขึ้นใหม่ (ไม่ได้อัดหรือเลียนเสียงคนจริง)
สร้างด้วย VoxCPM2 บน Mac ชิป Apple Silicon ใช้งานออฟไลน์ได้หลังติดตั้ง ไม่ต้องจ่าย API

## ติดตั้ง

1. คัดลอกทั้งโฟลเดอร์ไปไว้ในโฟลเดอร์ skill เช่น `~/.claude/skills/thai-narrator/`
   (Claude Code) หรือ `.agents/skills/thai-narrator/` (OpenCode)
2. ต้องมี Python 3.11+, FFmpeg และ Mac ชิป Apple Silicon
3. ทำตามขั้น Setup ใน `SKILL.md` (ดาวน์โหลดโมเดล VoxCPM2 จาก Hugging Face ตามเงื่อนไขของผู้พัฒนาโมเดล)

## ใช้งาน

บอก agent ประมาณนี้: “ใช้ thai-narrator อ่านบทพากย์นี้ แล้วบอกความยาวแต่ละบรรทัด”

## ไลเซนส์ในแพ็กเกจนี้

| ไฟล์ | ไลเซนส์ |
|---|---|
| SKILL.md, scripts/, ไฟล์ตั้งค่า | MIT (kubcode.dev) — `LICENSE` |
| assets/narrator-reference.wav | MIT (kubcode.dev) — เสียงสังเคราะห์ต้นฉบับ ไม่ใช่เสียงบุคคลจริง |
| โมเดล VoxCPM2 | ไม่รวมในแพ็กเกจ ดาวน์โหลดเองจาก Hugging Face ตามเงื่อนไขของโมเดล |

รายละเอียด: `KUBCODE-NOTICE.md`
