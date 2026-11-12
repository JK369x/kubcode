# แผนผังโปรเจกต์ AI Video

## ที่ทำงานหลัก

`jk-animation-studio` เป็น repo กลางของ **สไตล์ + kit + ตัวอย่าง** ไม่ใช่การรวมทุก renderer ให้ใช้คำสั่งเดียว

```text
jk-animation-studio/
├── styles/<style-id>/
│   ├── style.json           สถานะ ภาพหลัก ตัวอย่าง และ attribution
│   ├── STYLE.md             แนวภาพ วิธีเริ่ม และข้อจำกัด
│   ├── assets/              ภาพตัวอย่าง
│   ├── examples/            วิดีโอที่มีจริง แยกผู้สร้างเมื่อมี
│   ├── source/              source ตัวอย่างที่คัดมา (เฉพาะชุดที่มี)
│   └── kit/                 เครื่องมือของแนวนั้น (เฉพาะชุดที่นำเข้าได้)
├── shared/                  ผู้บรรยายไทย สุขุม / ซับ / ปก ที่ใช้ร่วมกัน
└── scripts/                 ตรวจ metadata / สร้าง draft
```

โฟลเดอร์ `source`, `kit`, `examples` ไม่บังคับทุกแนว: สไตล์ที่มีเพียงคู่มือจะระบุชัด ไม่มีการสร้างวิดีโอหลอกแทนหลักฐานที่ขาด

## Workspace ภายนอก repo

- `../00-คลังงาน-AI/` — คลังตอนเดิม งานส่งมอบ และวิจัย คงโครงสร้างปัจจุบัน ไม่ย้ายซ้ำหรือลบทางผ่าน
- `../lemo-opuscar/` — renderer/คลังแนว Lemo แยก upstream ไม่ใช่ engine ของ JK; การอ้างอิงใน catalog ไม่ได้แปลว่าใช้ JK render ได้ทันที
- `../ai-prompt-journey/`, `../videos/` — งานตอน/preview เดิม ไม่รวม dependencies หรือ state บัญชีมาใน repo นี้
- `../youtube/`, `../instagram/`, `../jk-channel-scheduler-mcp/` — งานแพลตฟอร์ม/คิว แยกจากสไตล์ภาพ
- ผลงานทดลอง Claude/Codex และ FreshStack ต้นฉบับยังอยู่ใน Movies; นำสำเนาตัวอย่างและ source ที่จำเป็นเข้า styles โดยไม่ย้ายต้นฉบับ

## กติกาการเลือก

1. เลือก **style-id** ก่อน แล้วอ่าน STYLE.md ของแนวนั้น
2. ผู้เขียนโค้ด (`Claude Code`, `Codex CLI`, `OpenCode/GLM`) แยกจาก **renderer**, **host integration** และ **voice**
3. ดูตัวอย่างจริงของผู้สร้างที่มี ไม่สรุปว่าทุกสไตล์มี Claude/Codex
4. `selected` เป็นขอบเขตการเลือกที่บันทึกไว้ใน metadata; `draft` ยังเลือกเพื่อทดลองได้ แต่ไม่ใช่การอนุมัติงานผลิต
5. ตรวจ prerequisites ของ kit ก่อน render ใหม่; ตัวอย่างที่เล่นได้ไม่เท่ากับทุก backend ติดตั้งพร้อมแล้ว
6. ไม่ commit `.env`, `.private`, credential, provider receipt, model weights, dependencies หรือบัญชีผู้ใช้ การผลิตไม่ใช่คำอนุญาตเผยแพร่

## ตรวจและอัปเดต

```sh
npm test
npm run check
npm run styles
```

`style.json` และ STYLE.md เป็นข้อมูลต้นทาง ไม่มี UI ใน studio/ (UI ผลิตภัณฑ์อยู่ในเว็บ kubcode) คำสั่ง render แต่ละชุดอยู่ใน STYLE.md ไม่ใช่คำสั่งเดียวสำหรับทุกแนว
