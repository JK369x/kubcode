// Numbered Thai steps for the skill page. Packaged skills get install steps
// and copyable prompts taken from their package README (tests check every
// prompt appears there); the rest get three plain steps.
import { approvedPackageFor } from "./packages";

export type GuideStep = {
  /** The step in plain Thai. */
  text: string;
  /** A path or command shown as code, if the step needs one. */
  code?: string;
  /** A prompt to paste into the agent, verbatim from the package README. */
  prompt?: string;
};

const GUIDES: Readonly<Record<string, readonly GuideStep[]>> = {
  "freshstack-what-if": [
    { text: "เข้าสู่ระบบ แล้วกด “ดาวน์โหลด skill” ในกล่องดาวน์โหลด (ไฟล์ .zip)" },
    { text: "แตกไฟล์ไว้ในโฟลเดอร์ skill ของ Claude Code", code: "~/.claude/skills/what-if-animation/" },
    { text: "ติดตั้ง Node 18+, ffmpeg และ Python 3.9+ (numpy, Pillow) แล้วตั้งคีย์ ElevenLabs", code: "ELEVENLABS_API_KEY" },
    { text: "ตั้ง studio ครั้งแรกตาม README.md ในชุด skill (ชุดนี้ไม่มี studio มาด้วย) ถ้าใช้ OpenCode ดูหัวข้อ “Use it in OpenCode”" },
    {
      text: "เปิด Claude Code ในโฟลเดอร์ studio แล้ววางคำสั่งนี้ เปลี่ยนคำถามเป็นเรื่องที่อยากทำได้",
      prompt: "Make a What If episode: what if you could pause everyone but you?",
    },
  ],
  "podcast-tool-short": [
    { text: "เข้าสู่ระบบ แล้วกด “ดาวน์โหลด skill” ในกล่องดาวน์โหลด (ไฟล์ .zip)" },
    {
      text: "คัดลอก SKILL.md, references/ และ agents/ ไปไว้ในโฟลเดอร์ skill",
      code: "~/.claude/skills/podcast-tool-short/",
    },
    { text: "คัดลอก helpers/yt-package/ และ helpers/yt-seo/ ไปไว้ข้างกัน (~/.claude/skills/yt-package/, ~/.claude/skills/yt-seo/)" },
    { text: "ติดตั้ง HyperFrames, FFmpeg และ whisper.cpp พร้อมโมเดลภาษาของพอดแคสต์", code: "npx hyperframes --help" },
    {
      text: "เปิด Claude Code วางคำสั่งนี้ แล้วแนบไฟล์หรือลิงก์ตอนพอดแคสต์",
      prompt: "ใช้ podcast-tool-short ทำคลิปแนะนำเครื่องมือจากพอดแคสต์ตอนนี้ 1 คลิป พร้อมฮุก ซับไทย และคำโพสต์",
    },
    { text: "ตรวจสิทธิ์และเครดิตของพอดแคสต์ต้นทางทุกตอนก่อนเผยแพร่ (ดู KUBCODE-NOTICE.md)" },
  ],
  "make-short": [
    { text: "เข้าสู่ระบบ แล้วกด “ดาวน์โหลด skill” ในกล่องดาวน์โหลด (ไฟล์ .zip)" },
    { text: "แตกไฟล์ไว้ในโฟลเดอร์ skill ของ Claude Code", code: "~/.claude/skills/make-short/" },
    { text: "ติดตั้ง Blender 5.x, Node 22+, Python 3.10+ (pillow, numpy) และ ffmpeg ถ้าใช้ Mac ให้อ่าน KUBCODE-NOTICE.md เรื่อง mac-patch.sh" },
    {
      text: "เปิด Claude Code แล้ววางคำสั่งนี้ เปลี่ยนหัวข้อเป็นเรื่องที่อยากทำได้",
      prompt: "/make-short a 15 second Short about why ice floats on water",
    },
    { text: "อนุมัติเรื่อง แผนช็อต และภาพนิ่งก่อนสั่ง render ทุกครั้ง skill จะไม่โพสต์อะไรจนกว่าคุณจะพิมพ์ go" },
  ],
  "elephant-goldfish-model": [
    { text: "ทางที่ง่ายที่สุด: ติดตั้งจาก marketplace ทางการของ Google ใน Claude Code (ได้อัปเดตด้วย)", code: "claude plugin marketplace add google/elephant-goldfish-model && claude plugin install egm@egm" },
    { text: "หรือเข้าสู่ระบบ กด “ดาวน์โหลด skill” แล้วแตกไฟล์ เปิด Claude Code ด้วย --plugin-dir ชี้ไปที่โฟลเดอร์นั้น", code: "claude --plugin-dir ~/plugins/egm" },
    { text: "เปิด session ใหม่ในโปรเจกต์ แล้วเริ่มคุยไอเดียด้วยคำสั่งนี้ (ใน Claude Code เติม /egm: ข้างหน้า เช่น /egm:egm-brainstorm)", prompt: "/egm-brainstorm Add webhook delivery to this project." },
    { text: "ตอบคำถามของช้างให้ครบ แล้วเขียนสเปกต่อด้วย /egm:egm-draft", code: "/egm:egm-draft" },
    { text: "ให้ปลาทองรีวิวสเปก เลือกเองว่าข้อไหนจะแก้ แล้วค่อยสั่งให้ลงมือสร้าง", code: "/egm:egm-review design_draft.md" },
  ],
};

/** The steps for a skill: its own guide, or three plain steps. */
export function guideFor(slug: string): readonly GuideStep[] {
  const own = GUIDES[slug];
  if (own && approvedPackageFor(slug)) return own;
  return [
    { text: "ดูคลิปตัวอย่าง แล้วเช็คว่าเป็นแนวที่อยากทำ" },
    { text: "เตรียมเครื่องมือตามรายการ “สิ่งที่ต้องมี” ในกล่องด้านข้าง" },
    { text: "skill นี้ยังไม่มีชุดให้ดาวน์โหลด ระหว่างนี้ใช้คลิปและรายการสิ่งที่ต้องมีเป็นแนวทาง" },
  ];
}
