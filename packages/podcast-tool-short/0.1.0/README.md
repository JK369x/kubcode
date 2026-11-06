# Podcast Shorts (podcast-tool-short)

ตัดช่วงที่อธิบายเครื่องมือจากพอดแคสต์เป็นคลิปแนวตั้ง 30–60 วินาที ใช้เสียงต้นฉบับ
ซับไทย ฮุกเปิดเรื่อง และคำโพสต์พร้อมเครดิตต้นทาง

## ติดตั้ง

1. คัดลอก `SKILL.md`, `references/` และ `agents/` ไปไว้ในโฟลเดอร์ skill ของ agent
   ที่ใช้ เช่น `.agents/skills/podcast-tool-short/` หรือ `~/.claude/skills/podcast-tool-short/`
2. คัดลอก `helpers/yt-package/` และ `helpers/yt-seo/` ไปไว้ข้างกัน
   (`.../skills/yt-package/`, `.../skills/yt-seo/`) skill หลักเรียกใช้สองตัวนี้ตอนเขียนชื่อ
   คำอธิบาย และแท็ก
3. ติดตั้งเครื่องมือในเครื่อง:
   - HyperFrames: `npx hyperframes --help` (ใช้เรนเดอร์คลิป)
   - FFmpeg
   - whisper.cpp พร้อมโมเดลที่รองรับภาษาของพอดแคสต์ (ใช้ถอดเสียง)

## ใช้งาน

บอก agent ประมาณนี้: “ใช้ podcast-tool-short ทำคลิปแนะนำเครื่องมือจากพอดแคสต์ตอนนี้
1 คลิป พร้อมฮุก ซับไทย และคำโพสต์” แล้วแนบไฟล์หรือลิงก์ตอนพอดแคสต์

ก่อนเผยแพร่ ตรวจสิทธิ์ของพอดแคสต์ต้นทางทุกตอน ดู `KUBCODE-NOTICE.md`
