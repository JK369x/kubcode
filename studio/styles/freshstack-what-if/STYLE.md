# FreshStack What If — draft

แนวภาพ: stick figure SVG ในห้องมีมิติ แสงยามเย็นและ practical light กล้อง/ท่าทางมีแรงจูงใจ เปิดด้วยทดลองพลังหลายจังหวะ ตั้งกติกา แล้วหักด้วยข้อเท็จจริง ก่อนจบ cliffhanger ตัวอย่าง “แตะแล้วเงียบ จนกว่าจะหัวเราะ” กติกาพลังเป็นเรื่องสมมติ ไม่ใช่ข้อเท็จจริง

## ตัวอย่างและเครดิตที่แยกกัน
`examples/glm/demo.mp4` คือ **Mute Touch** 23.9s, 1920×1080, 30fps
- ผู้เขียนตอน: OpenCode / opencode/glm-5.3-flash-free ไม่ใช่ Claude หรือ Codex
- Kit: FreshStack / what-if-animation, upstream commit `8092fb5e825e55456d1d47fec0ebf595cb93cc0d` (MIT)
- Renderer: React SVG / Remotion 4.0.530; host conform/mix/master ด้วย FFmpeg
- เสียง: ElevenLabs eleven_v3 ภาษาไทย พร้อม sound assets เดิม ไม่ใช่ผู้บรรยายไทย สุขุม (local)
- spend guard, alignment, safety และ mastering/QA patches ของ host ต้องไม่ยกเป็นงาน GLM ทั้งหมด registry นำเข้านี้ลดเหลือ mute-touch เท่านั้น

## แก้และเรนเดอร์แบบไม่สร้างเสียงใหม่
มี source จริงและ WAV ที่ final ใช้อยู่ใน `source/studio` ไม่รวม tutorial episodes อื่น
Recipe ต่อไปนี้ตรงกับ entrypoint/package จริง **ยังไม่ยืนยัน install/render จาก clean clone หรือ final mastering parity**:

```sh
cd styles/freshstack-what-if/source/studio
npm ci
npm run typecheck
npx remotion render src/index.ts MuteTouch out/mute-touch-rerender.mp4
```

Google Fonts ต้องใช้ network; Thai captions ใช้ Thonburi / Noto Sans Thai ต้องจัดฟอนต์ที่มีสิทธิ์เองในเครื่องใหม่ Remotion มีเงื่อนไข license แยกตามการใช้งาน ไม่ใช่ MIT ของ kit การ render จาก WAV เดิมไม่ต้องเรียก ElevenLabs แต่ final master อาจมี postprocess ต่างจาก render ตรง

## ห้ามใช้ approval เก่าสร้างเสียงใหม่
**ต้องขออนุมัติค่าใช้จ่าย ElevenLabs ใหม่อย่างชัดเจนก่อน paid run ทุกครั้ง** การอนุมัติในโปรเจกต์ต้นทางปิด completed แล้วและไม่ได้คัดลอกมา `kit/scripts/spend_guard.py` เป็น local patched guard แบบ fail-closed: ไม่มี private approval และ exact released payload ต้องปฏิเสธก่อน transport ไม่มี secret, .env, .private, raw provider receipts หรือ spending authorization ใน bundle นี้ ห้าม bypass guard และห้ามเรียก paid API เพื่อทดสอบ คำสั่งด้านบนใช้ไฟล์เสียงเดิมเท่านั้น

สถานะ draft: technical copy/decode verification ไม่ใช่การอนุมัติ style/เสียง/ข้อเท็จจริง/เผยแพร่ ดู `PROVENANCE.json`
