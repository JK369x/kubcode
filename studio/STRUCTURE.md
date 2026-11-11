# เข้าใจโครงสร้าง AI Video ของเรา

คู่มือนี้อธิบายไฟล์ที่ตรวจพบใน workspace ปัจจุบัน ไม่ได้หมายความว่าทุก renderer ใช้แทนกันได้ และไม่ใช่รายงานว่าจัด repo ทั้งหมดเสร็จแล้ว

## จำเป็นแค่แยกหกเรื่อง

| ชั้น | คำถามที่ตอบ | ตัวอย่างในโปรเจกต์ |
|---|---|---|
| เรื่อง/ตอน | เล่าอะไร คนดูเห็นอะไร | บท, shot plan, timeline, mute-touch |
| สไตล์ | ภาพหน้าตาอย่างไร | JK Soft Story, Low-poly Urban |
| ผู้เขียน | ใครเขียนโค้ด/จัดฉาก | Claude Code, Codex CLI, OpenCode/GLM |
| ชุดสร้างและ renderer | สร้างภาพเคลื่อนไหวและ export อย่างไร | GrowKaz Canvas/Three.js, HyperFrames, Remotion, Lemo core |
| เสียง/ซับ | พูดอย่างไร ขึ้นข้อความเมื่อไร | Thai narrator, ElevenLabs, caption preset |
| ผลงาน/หลักฐาน | ส่งไฟล์อะไร ตรวจอะไรจริง | MP4, source, hash, probe, QA report |

**สไตล์ไม่ใช่ skill, skill ไม่ใช่ renderer และ Claude/Codex ไม่ใช่สไตล์ภาพ**

`SKILL.md` เป็นวิธีทำงานที่ agent อ่าน ไม่ใช่โปรแกรมสร้างวิดีโอด้วยตัวเอง บาง skill มี scripts/kit ที่รันได้แนบมาด้วย ต้องแยกสิ่งที่เอกสารอธิบายจากสิ่งที่โค้ดรองรับจริง

## โฟลเดอร์ที่มีจริงใน repo

```text
jk-animation-studio/
├── README.md          จุดเริ่ม อ่านว่าต้องเปิดอะไร/รันอะไร
├── AGENTS.md          กติกาให้ agent ทำงานใน repo
├── CLAUDE.md          ชี้ให้ Claude อ่านกติกากลาง ไม่ใช่ workflow ใหม่
├── DIRECTOR.md        หลักเล่าเรื่อง จัดช็อต แสดงอารมณ์ ตรวจงาน
├── TECHNIQUE.md       วิธีใช้เทคโนโลยี/ข้อกำหนด render ของชุดเดิม
├── CATALOG.md         ทะเบียนสไตล์ สร้างจาก metadata
├── gallery/           หน้าเลือกแนวและดูคลิป สร้างจาก metadata
├── styles/            แนวภาพ + ตัวอย่าง + ชุดเครื่องมือบางแนว
├── pipelines/         โค้ดนำแผนไปสร้างงาน เช่น low-poly mall / JK Window
├── shared/            ผู้บรรยายไทย สุขุม, รูปแบบซับ, คู่มือปก ที่ใช้ร่วมกัน
├── .agents/skills/    วิธีทำงานให้ agent โหลดเฉพาะงานที่เกี่ยวข้อง
├── scripts/           โปรแกรมช่วย catalog / gallery / setup / ตรวจความพร้อม
├── tests/             โปรแกรมทดสอบ ป้องกันแก้แล้วของเก่าพัง
├── package.json       รายการคำสั่ง npm และ dependency โดยตรง
├── package-lock.json  ล็อกรุ่น dependency เพื่อให้ติดตั้งใกล้เคียงกัน
├── THIRD-PARTY.md     ที่มา/ข้อจำกัดสิทธิ์ ไม่ควรลบทิ้ง
├── outputs/           งานที่สร้างในเครื่อง ไม่ใช่คลังสไตล์หลัก
└── node_modules/      dependency ในเครื่อง ติดตั้งใหม่ได้ ไม่ส่งเข้า Git
```

ตัว repo ไม่ใช่ที่เก็บทุก episode ของทั้ง workspace งานตอนเดิมยังอยู่ใน `../00-คลังงาน-AI/` และงานเปรียบเทียบบางชุดมีต้นฉบับใน Movies

### ข้างใน styles/<id>/

- `style.json`: ข้อมูลให้โปรแกรมอ่าน เช่น id, name, status, preview, ตัวอย่างผู้สร้าง; หน้าเลือกใช้ข้อมูลนี้ จึงต้องมีและตรวจ path ได้
- `STYLE.md`: แนวภาพ วิธีใช้ ขอบเขตและข้อจำกัด ให้คน/agent อ่าน ไม่ควรทำสำเนากฎยาวนี้ในทุก skill
- `assets/`: ภาพ/โปสเตอร์ที่ใช้ดูและเลือกสไตล์ ไม่ได้เป็นตัววิดีโอทั้งหมด
- `components/`: ตัวละคร/พร็อพแก้ไขต่อได้ มีเฉพาะแนวที่เตรียมไว้ ไม่จำเป็นต้องสร้างโฟลเดอร์ว่างทุกแนว
- `examples/<author>/demo.mp4`: ผลงานจริงสำหรับดู ไม่ใช่ source; Claude/Codex ต้องแยกเมื่อมีจริง
- `source/`: โค้ดและข้อมูลของตัวอย่าง เพื่อศึกษา/แก้/สร้างซ้ำ ไม่ใช่ cache
- `kit/`: engine/scripts ของชุดที่นำเข้ามา แต่ไม่ใช่ทุก style ต้องมี engine ของตัวเอง หากใช้ร่วมกันจริงควรมีตัวกลางเพียงชุดเดียว
- `PROVENANCE.json`: บอกที่มาและสิ่งที่คัดมา ช่วยตรวจ attribution/สิทธิ์และแยกจากงานที่เขียนใหม่

### ไฟล์ของหนึ่งตอน

ชื่อขึ้นกับเครื่องมือ ไม่ต้องบังคับว่าทุกชุดมีทุกไฟล์:

| หน้าที่ | ตัวอย่างไฟล์จริง | ถ้าขาด |
|---|---|---|
| บท/โจทย์ | script.md, SPEC.md, episode.json | ไม่รู้ว่าเรื่องที่ต้องเล่าคืออะไร |
| รายการช็อต/เหตุการณ์ | shots.json, shots.py, timeline.json | จังหวะและภาพไม่สัมพันธ์กับเสียง |
| โค้ดฉาก | index.html, scene.js, shots.tsx | ไม่มีวิธีวาดและขยับภาพ |
| วัตถุดิบ | audio/, public/, assets/ | source อาจเปิดแต่ render ไม่ครบ |
| เวลาเสียง/ซับ | words.json, captions.json | ซับและการกระทำอาจไม่ตรงคำพูด |
| การตั้งค่า | config.json, hyperframes.json, remotion.config.ts | ไม่รู้ขนาด fps/entrypoint หรือการ export |
| ผลส่งมอบ | final.mp4, subtitle.srt | ไม่มีชิ้นงานให้ดู/ส่งต่อ |
| ผลตรวจ | verification.json, report.json | ไม่รู้ว่าเช็กอะไรจริง ไม่ใช่แค่คำว่าเสร็จ |

เส้นทางโดยรวม: **เลือกแนว → บท → เสียงจริง → เวลา/แผนช็อต → ฉาก/animation → render ภาพ → ผสมเสียง/ซับ → ตรวจ MP4 → ส่งมอบ** แต่ละ kit อาจรวมขั้น render/เสียงต่างกัน

## Skill แต่ละกลุ่มต่างกันอย่างไร

### กลุ่มใน repo

| Skill | หน้าที่ | ควรรวมกับอะไรไหม |
|---|---|---|
| jk-animation-studio | ใช้งานและดูแลคลังสไตล์ | ควรอ่านข้อมูลจาก catalog ไม่คัดลอกรายชื่อสไตล์/กฎภาพทั้งหมด |
| jk-soft-story | ใช้แนวภาพ Soft Story | รายละเอียดภาพควรอยู่ STYLE.md จุดเดียว; skill เหลือวิธีเลือกและตรวจแนวนี้ |
| jk-shot-plan-v1 | นำ JSON plan ไปทำ pilot ฉาก JK Window | ไม่ใช่ renderer ทั่วไป และไม่ใช่ low-poly mall |
| jk-low-poly-beats | นำแผนและ speech anchors ไปสร้างฉากห้าง low-poly | คงแยกจาก JK Window เพราะ scene/action contract ต่างกัน |
| thai-narrator | สร้างผู้บรรยายไทย สุขุม ผ่าน local VoxCPM2/MLX | ใช้ร่วมข้ามสไตล์ได้ ไม่ควรมีสำเนารายสไตล์ |
| captions-overlay | หลักจัดข้อความทับภาพ | ไม่ใช่ตัวสร้างเสียงหรือรูปแบบสี/ฟอนต์เฉพาะแนว |
| youtube | เลือกช่อง/ตรวจสิทธิ์และ workflow ของ YouTube | ไม่ควรรวมกับการสร้างภาพ; สร้างคลิปไม่ใช่อนุญาตอัปโหลด |
| youtube-api-upload | รายละเอียดขั้น upload ภายใต้ youtube | มีแนวโน้มย้ายเป็น reference/module ใต้ youtube ลด entrypoint ซ้ำได้ แต่ต้องแก้ลิงก์ทั้งหมด |
| instagram | งานบัญชี/โพสต์ของ Instagram | แยก provider/บัญชี ไม่ใช้แทน YouTube |

### กลุ่ม kit ที่เพิ่งนำเข้า

| Kit skill | วิธีสร้าง | เหตุผลที่ยังแยก |
|---|---|---|
| GrowKaz make-2d-video | Canvas + Three.js + headless Chromium + FFmpeg | engine/scene API/timeline คนละแบบกับอีกสองชุด |
| thai-survival-clip | Python สร้าง SVG/HTML แล้วใช้ HyperFrames | สูตรซีรีส์/โครงช็อตและเครื่องมือภาพต่างจาก GrowKaz |
| what-if-animation | React/SVG + Remotion; upstream มี ElevenLabs workflow | schema และ runtime ต่างกัน เสียง/API เป็นส่วนที่ต้องขออนุมัติแยก |

`Genhaha Horror` กับ `Genhaha Map` มีเพียง style wrapper ใน repo ปัจจุบัน ชุดต้นทางแยกและมีข้อจำกัดสิทธิ์ ไม่ใช่คัดลอก kit มาครบแล้ว ส่วน Lemo มี STYLE.md หลายแนวบน core ของตนเอง ไม่ใช่ renderer ใหม่หนึ่งตัวต่อหนึ่งแนว

## สิ่งซ้ำที่ตรวจพบ และควรจัดอย่างไร

### ควรรวมแหล่งกฎ

- กฎภาพอยู่ `styles/<id>/STYLE.md`
- ข้อมูล catalog อยู่ `style.json`
- กฎเสียงอยู่ `shared/voice/` ไม่คัดกฎ/เสียงซ้ำทุกสไตล์
- นโยบายซับและค่าตั้งอยู่ `shared/captions/` ส่วน adapter ของ renderer ยังแยกได้
- กฎ account/publishing อยู่ใน provider skill ไม่คัดลงทุก skill วิดีโอ
- gallery/CATALOG เป็นไฟล์สร้างอัตโนมัติ มี source เดียว ไม่ใช่สองฐานข้อมูล

### ชื่อซ้ำแต่ลบแทนกันทันทีไม่ได้

ตรวจ `.agents/skills` ที่ workspace และที่ repo พบชื่อซ้ำ ได้แก่ captions-overlay, instagram, jk-animation-studio, jk-soft-story, thai-narrator, youtube, youtube-api-upload แต่ในขอบเขตนี้ **ไม่มี SKILL.md คู่ใดเหมือนกันทุก byte**

สำคัญที่สุด: YouTube ของ workspace ชี้ระบบ Python ที่มีอยู่จริงบนเครื่อง ส่วนของ repo อธิบาย Bun/Elysia starter ที่ยังไม่มี upload endpoint การลบฝั่งหนึ่งเพราะชื่อเหมือนกันอาจทำให้ใช้ระบบผิดหรือเสียความสามารถเดิม

ทางแก้คือกำหนดเจ้าของแต่ละความสามารถและขอบเขต local/portable ให้ชัด ย้ายเนื้อหาร่วมเป็น reference แล้วเหลือ adapter ที่จำเป็น ไม่ใช่สร้างอีกรุ่นขึ้นมาทับ

### โค้ดเหมือนกันบางไฟล์ แต่ทั้งชุดไม่เหมือน

Thai Survival มี `build.py` และ `caption_groups.py` ตรงกันใน kit กลางและ source ของ Claude/Codex แต่ `framework.py` และ `lib_draw.py` ของทั้งสามชุดมี hash ต่างกัน ดังนั้นยังรวมทั้งโฟลเดอร์แล้วลบ source สองฝั่งไม่ได้

ถ้าจะลดซ้ำจริง ต้องย้ายเฉพาะ helper ที่มี contract เดียวกันไปใช้ร่วม แก้ import/path และทดสอบ build ของทั้ง Claude/Codex ก่อน ส่วน snapshot สำหรับทำซ้ำงานเก่าต้องคงรุ่นหรือทำ manifest ระบุรุ่นที่ใช้

### ยังไม่ลบอะไรในรอบอธิบายนี้

รอบนี้ตรวจและจัดคู่มือ ไม่มีการลบ skill/source/dependency หรือเปลี่ยน production backend ขั้น dedup เป็นงานต่อที่ต้องรักษาความสามารถเดิมและผ่านทดสอบก่อน งาน catalog เดิมยังต้องรวมแนวภายนอกและตรวจ git/remote ให้เสร็จ แกลเลอรีที่เปิดได้ไม่ใช่หลักฐานว่าขั้นเหล่านั้นครบแล้ว
