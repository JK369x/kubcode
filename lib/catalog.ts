import styleData from "./styles.json";
import { publishSkills, MEDIA_POLICY } from "./publication";
export const styles = styleData;
export const PREVIEW_NOTICE = MEDIA_POLICY === "licensed-only"
  ? "PUBLIC_PREVIEW_MEDIA_WITHHELD_PENDING_RIGHTS"
  : "LOCAL_PREVIEW_NOT_CLEARED_FOR_DISTRIBUTION";
export type Example = {
  id: string;
  label: string;
  video?: string | null;
  poster?: string;
  author: string;
  model: string;
  renderer: string;
  voice: string;
  notes: string;
  /** Set only by publishSkills when this build removed the example's media. */
  mediaWithheld?: "rights-pending";
};
export type Skill = {
  slug: string;
  name: string;
  category: string;
  description: string;
  version: string;
  status: string;
  approvalScope: string;
  requirements: string[];
  rights: "uncleared";
  examples: Example[];
};
export const categories = [
  { id: "all", label: "ทั้งหมด" },
  { id: "video", label: "วิดีโอ / ภาพ" },
  { id: "audio", label: "เสียง" },
  { id: "captions", label: "ซับไตเติล" },
  { id: "code", label: "โค้ด" },
  { id: "work", label: "การทำงาน" },
];
/**
 * Raw local catalog: original definitions and local asset paths, never
 * mutated. Pages must render `skills`, which applies the media policy.
 */
export const rawSkills: readonly Skill[] = [
  {
    slug: "growkaz-stickman",
    name: "Stickman Cinema",
    category: "video",
    description:
      "ภาพ stickman ฉากมืด แสงเวที และจังหวะกล้อง ทดลองจากผู้เขียนสองคน",
    version: "0.1.0",
    status: "draft",
    approvalScope:
      "ตัวอย่างนี้ใช้ศึกษาและเลือกแนวเท่านั้น ยังไม่ใช่การอนุมัติภาพ การเคลื่อนไหว เสียง ข้อเท็จจริง การผลิต หรือสิทธิ์เผยแพร่",
    requirements: [
      "Node 18+ · Python 3.9+",
      "Playwright / Chromium · FFmpeg",
      "ยังไม่ทดสอบติดตั้งจากเครื่องใหม่",
    ],
    rights: "uncleared",
    examples: [
      {
        id: "claude",
        label: "Claude — ตัวอย่างจริง",
        video: "/previews/growkaz-stickman-claude.mp4",
        author: "Claude Code",
        model: "claude-opus-5-5",
        renderer: "Canvas 2D + Playwright/Chromium + FFmpeg",
        voice: "JK local VoxCPM2/MLX; original individual narration retained",
        notes:
          "Original portrait individual export; not the corrected comparison introduction.",
        poster: "/previews/growkaz-stickman-claude.jpg",
      },
      {
        id: "codex",
        label: "Codex — ตัวอย่างจริง",
        video: "/previews/growkaz-stickman-codex.mp4",
        author: "Codex CLI",
        model: "gpt-6.1-sol",
        renderer: "Canvas 2D + Playwright/Chromium + FFmpeg",
        voice: "JK local VoxCPM2/MLX; original individual narration retained",
        notes:
          "Original portrait individual export; host mechanically rendered/mixed Codex source.",
        poster: "/previews/growkaz-stickman-codex.jpg",
      },
    ],
  },
  {
    slug: "thai-survival",
    name: "Survival Stories",
    category: "video",
    description:
      "ฉากไทยน้ำท่วมในเรื่องแต่ง ภาพแนวตั้งจาก Claude และ Codex ไม่ใช่คำแนะนำเอาตัวรอด",
    version: "0.1.0",
    status: "draft",
    approvalScope:
      "ตัวอย่างนี้ใช้ศึกษาและเลือกแนวเท่านั้น ยังไม่ใช่การอนุมัติภาพ การเคลื่อนไหว เสียง ข้อเท็จจริง การผลิต หรือสิทธิ์เผยแพร่",
    requirements: [
      "Python 3 · Node",
      "HyperFrames 0.8.192 · GSAP · FFmpeg",
      "ต้องจัดฟอนต์ไทยเอง",
    ],
    rights: "uncleared",
    examples: [
      {
        id: "claude",
        label: "Claude — ตัวอย่างจริง",
        video: "/previews/thai-survival-claude.mp4",
        author: "Claude Code",
        model: "claude-opus-5-5",
        renderer: "Python SVG + GSAP / HyperFrames 0.8.192 + host FFmpeg",
        voice: "JK reused full-sentence introduction; no original survival VO",
        notes:
          "10-second fictional picture teaser, not the original 68-second episode; host badge/audio assembly.",
        poster: "/previews/thai-survival-claude.jpg",
      },
      {
        id: "codex",
        label: "Codex — ตัวอย่างจริง",
        video: "/previews/thai-survival-codex.mp4",
        author: "Codex CLI",
        model: "gpt-6.1-sol",
        renderer: "Python SVG + GSAP / HyperFrames 0.8.192 + host FFmpeg",
        voice: "JK reused full-sentence introduction; no original survival VO",
        notes:
          "10-second fictional picture teaser; host rendered and mixed actual independently authored source.",
        poster: "/previews/thai-survival-codex.jpg",
      },
    ],
  },
  {
    slug: "freshstack-what-if",
    name: "What If Lab",
    category: "video",
    description: "Mute Touch — ทดลองกติกาพลังสมมติ ด้วย React SVG และเสียงไทย",
    version: "0.1.0",
    status: "draft",
    approvalScope:
      "ตัวอย่างนี้ใช้ศึกษาและเลือกแนวเท่านั้น ยังไม่ใช่การอนุมัติภาพ การเคลื่อนไหว เสียง ข้อเท็จจริง การผลิต หรือสิทธิ์เผยแพร่",
    requirements: [
      "Node 18+ · React 19",
      "Remotion 4.0.530 · FFmpeg",
      "Remotion และเสียงมีเงื่อนไขสิทธิ์แยก",
    ],
    rights: "uncleared",
    examples: [
      {
        id: "glm",
        label: "OpenCode / GLM — Mute Touch",
        video: "/previews/freshstack-what-if-glm.mp4",
        author: "OpenCode",
        model: "opencode/glm-5.3-flash-free",
        renderer: "React SVG / Remotion 4.0.530 + host FFmpeg master",
        voice: "ElevenLabs eleven_v3 Thai narration; ElevenLabs sound assets",
        notes:
          "OpenCode/GLM authored episode; local host safety/alignment/mastering/QA patches are separate, not claimed as GLM authorship. Existing approval is completed and does not authorize new paid runs.",
        poster: "/previews/freshstack-what-if-glm.jpg",
      },
    ],
  },
  {
    slug: "jk-soft-story",
    name: "Soft Story",
    category: "video",
    description:
      "ฉากเล่าเรื่อง 2D แสงนุ่ม ภาพนิ่ง v2 ที่เลือกแล้ว ไม่ใช่การอนุมัติเสียงหรือ animation",
    version: "2",
    status: "selected",
    approvalScope: "เลือกแนวภาพนิ่ง v2 แล้ว · animation และเสียงรอตรวจแยก",
    requirements: [
      "Editable SVG",
      "อ่าน STYLE.md ก่อนปรับภาพ",
      "animation และเสียงต้องตรวจแยก",
    ],
    rights: "uncleared",
    examples: [
      {
        id: "study",
        label: "ตัวอย่างในเครื่อง",
        video: null,
        poster: "/previews/jk-soft-story.png",
        author: "JK local study",
        model: "ไม่ระบุ",
        renderer: "Editable SVG",
        voice: "ตัวอย่างเงียบ",
        notes: "เลือกแนวภาพนิ่ง v2 แล้ว · animation และเสียงรอตรวจแยก",
      },
    ],
  },
  {
    slug: "low-poly-urban",
    name: "Low-poly Urban",
    category: "video",
    description:
      "เมือง low-poly กับกล้องและการเคลื่อนไหว ตัวอย่างเงียบ 8 วินาที",
    version: "0.3",
    status: "selected",
    approvalScope:
      "ภาพ/motion ผ่านตัวอย่าง 8s เดิม · ซับไทยไฮไลต์คำสำคัญ + อังกฤษเล็ก ผ่าน 29 ต.ค. 2026 · เสียงและฉากใหม่ตรวจแยก",
    requirements: [
      "Three.js 0.170.0 · GSAP",
      "HyperFrames · Node",
      "ซับรุ่นปัจจุบันต่างจากตัวอย่างเดิม",
    ],
    rights: "uncleared",
    examples: [
      {
        id: "study",
        label: "ตัวอย่างในเครื่อง",
        video: "/previews/low-poly-urban-study.mp4",
        poster: "/previews/low-poly-urban.png",
        author: "JK local study",
        model: "ไม่ระบุ",
        renderer: "Three.js / HyperFrames",
        voice: "ตัวอย่างเงียบ",
        notes:
          "ภาพ/motion ผ่านตัวอย่าง 8s เดิม · ซับไทยไฮไลต์คำสำคัญ + อังกฤษเล็ก ผ่าน 29 ต.ค. 2026 · เสียงและฉากใหม่ตรวจแยก",
      },
    ],
  },
  {
    slug: "thai-jk-voice",
    name: "Thai Voice",
    category: "audio",
    description:
      "เสียงบรรยายไทยสังเคราะห์ ใช้ shared voice เพียงแหล่งเดียว ไม่ใช่เสียงบันทึกของเจ้าของเว็บ",
    version: "portable bundle",
    status: "local",
    approvalScope:
      "ทดสอบสร้างเสียงใน environment เฉพาะ ไม่ใช่การรับรอง perceptual match",
    requirements: [
      "Apple Silicon macOS · Python 3.11+",
      "FFmpeg · VoxCPM2 / MLX",
      "ดาวน์โหลด weights และตรวจ upstream terms ก่อนใช้",
    ],
    rights: "uncleared",
    examples: [],
  },
  {
    slug: "captions-overlay",
    name: "Captions Overlay",
    category: "captions",
    description:
      "แยกเวลาและนโยบายข้อความออกจากเสียง ใช้ adapter ให้ตรงกับ renderer ไม่สร้างสำเนากฎทุกสไตล์",
    version: "shared policy",
    status: "local",
    approvalScope: "รูปแบบซับและการอนุมัติแยกจากภาพและเสียง",
    requirements: [
      "เวลาเสียงจริง / captions.json",
      "ฟอนต์ไทยที่มีสิทธิ์ใช้งาน",
      "adapter สำหรับ renderer ที่เลือก",
    ],
    rights: "uncleared",
    examples: [],
  },
];
/** Catalog as published by this build (see lib/publication.ts). */
export const skills: Skill[] = publishSkills(rawSkills);
export function filterSkills(items: Skill[], query: string, category: string) {
  const q = query.trim().toLocaleLowerCase();
  return items.filter(
    (s) =>
      (category === "all" || s.category === category) &&
      JSON.stringify(s).toLocaleLowerCase().includes(q),
  );
}
