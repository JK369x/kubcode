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
