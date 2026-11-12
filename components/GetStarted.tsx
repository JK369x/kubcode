import Link from "next/link";
import { CopyButton } from "./CopyButton";

/*
 * "Start with the first skill": install steps, copyable prompts and an FAQ
 * for What If, the first downloadable package. Every statement comes from
 * docs/adr/0002-skill-package-downloads.md or the package's own README and
 * KUBCODE-NOTICE (packages/freshstack-what-if/0.1.0/). Update them together.
 */

// Example prompts from the package README and SKILL.md (MIT, FreshStack).
const PROMPTS = [
  "Make a What If episode: what if you could pause everyone but you?",
  "Make a What If episode: what if you could rewind 10 seconds?",
  "Make a What If episode: what if you could copy and paste anything?",
];

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "ดาวน์โหลดฟรีไหม",
    a: "ฟรีสำหรับสมาชิก เข้าสู่ระบบด้วย Google หรือ LINE แล้วโหลดได้วันละไม่เกิน 20 ครั้ง ไม่ต้องใช้บัตรเครดิต",
  },
  {
    q: "มีค่าใช้จ่ายอื่นไหม",
    a: "What If ใช้ ElevenLabs ทำเสียงพากย์และเสียงประกอบ ตาม README ใช้ราว 150–240 เครดิตต่อตอน แผนฟรีของ ElevenLabs ใช้ในงานเชิงพาณิชย์ไม่ได้ ตรวจเงื่อนไขก่อนหารายได้จากคลิป",
  },
  {
    q: "ใช้กับ AI ตัวไหนได้",
    a: (
      <>
        <Link href="/tools/claude-code">Claude Code</Link> หรือ <Link href="/tools/opencode">OpenCode</Link> ซึ่งใช้กับโมเดลฟรีได้
        ดูหัวข้อ “Use it in OpenCode” ใน README ของชุด skill
      </>
    ),
  },
  {
    q: "ทำไมต้องเข้าสู่ระบบก่อนโหลด",
    a: "เพื่อจำกัดจำนวนการโหลดต่อคน ระบบบันทึกว่าบัญชีไหนโหลด skill อะไรเมื่อไหร่",
  },
  {
    q: "สไตล์อื่นจะโหลดได้เมื่อไหร่",
    a: "ทยอยเปิดทีละ skill หลังตรวจสิทธิ์ครบ ส่วน Stickman Cinema และ Survival Stories จะไม่เปิดให้โหลด เพราะไม่มีสัญญาอนุญาตให้แจกต่อ",
  },
  {
    q: "เอาคลิปที่ทำไปลงช่องตัวเองได้ไหม",
    a: "skill What If แจกภายใต้สัญญา MIT ต้องให้เครดิต FreshStack ส่วน Remotion ฟอนต์ และ ElevenLabs มีเงื่อนไขของตัวเอง ตรวจก่อนใช้เชิงพาณิชย์",
  },
];

export function GetStarted() {
  return (
    <section className="get-started" id="get-started" tabIndex={-1} aria-labelledby="get-started-heading">
      <div className="get-started-head">
        <h2 id="get-started-heading">เริ่มใช้ skill แรก: What If</h2>
        <p>
          What If เป็น skill แรกที่เปิดให้โหลด พิมพ์คำถาม “ถ้าเกิดว่า…” บรรทัดเดียว
          แล้วได้คลิปแอนิเมชันตัวละครเส้นยาว 15–25 วินาที ทุกฉากวาดด้วยโค้ด
        </p>
      </div>
      <div className="get-started-grid">
        <div>
          <h3>ติดตั้งทีละขั้น</h3>
          <ol className="get-started-steps">
            <li>
              เข้าสู่ระบบด้วย Google หรือ LINE แล้วกดดาวน์โหลดจาก
              <Link href="/skills/freshstack-what-if"> หน้า skill What If</Link> (ไฟล์ .zip)
            </li>
            <li>
              แตกไฟล์ไว้ที่ <code>~/.claude/skills/what-if-animation/</code> ซึ่งเป็นโฟลเดอร์ skill ของ Claude Code
            </li>
            <li>
              ติดตั้ง Node 18+, ffmpeg และ Python 3.9+ (numpy, Pillow) แล้วตั้ง <code>ELEVENLABS_API_KEY</code>
            </li>
            <li>ตั้ง studio ครั้งแรกตาม README.md ในชุด skill (ชุดนี้ไม่มี studio มาด้วย)</li>
            <li>เปิด Claude Code ในโฟลเดอร์ studio แล้วพิมพ์คำสั่งตามตัวอย่าง</li>
          </ol>
          <h3>ตัวอย่างคำสั่ง</h3>
          <p className="get-started-note">จาก README ของ skill กดคัดลอกแล้ววางใน Claude Code ได้เลย</p>
          {PROMPTS.map((prompt) => (
            <div className="code-block get-started-prompt" key={prompt}>
              <div className="code-body">
                <CopyButton label="คัดลอก prompt" />
                <pre>
                  <code>{prompt}</code>
                </pre>
              </div>
            </div>
          ))}
        </div>
        <div>
          <h3>คำถามที่พบบ่อย</h3>
          <div className="get-started-faq">
            {FAQ.map(({ q, a }) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
