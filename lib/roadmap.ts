/**
 * /roadmap ("แผนที่จะมา"), rendered from this list only.
 *
 * Rules (owner, 2026-11-12):
 * - `now` lists only what works today.
 * - `next` and `later` are not available; the page marks every one of them
 *   "ยังไม่เปิด". No prices and no dates are promised (`quarter` is an optional
 *   rough target, left empty until the owner sets it).
 * - /pricing never sells a `next` or `later` item; `tests/pricing.test.ts`
 *   checks that.
 * - Every `next`/`later` item has a "แจ้งฉันเมื่อเปิด" waitlist button
 *   (`lib/waitlist`, target kind "roadmap").
 *
 * Seed values are placeholders for the owner to finalise.
 */
export type RoadmapStatus = "now" | "next" | "later";

export type RoadmapItem = {
  id: string;
  titleTh: string;
  titleEn: string;
  status: RoadmapStatus;
  descriptionTh: string;
  /** Rough target such as "2027 Q1"; shown as "เป้าหมายคร่าว ๆ", never as a promise. */
  quarter?: string;
};

export const ROADMAP_SECTIONS: readonly { status: RoadmapStatus; titleTh: string; leadTh: string }[] = [
  { status: "now", titleTh: "ตอนนี้ใช้ได้", leadTh: "ใช้งานได้แล้ววันนี้" },
  { status: "next", titleTh: "กำลังทำ", leadTh: "อยู่ระหว่างพัฒนา ยังไม่เปิดให้ใช้" },
  { status: "later", titleTh: "ในอนาคต", leadTh: "แนวคิดที่วางไว้ ยังไม่เริ่มสร้าง" },
];

export const ROADMAP: readonly RoadmapItem[] = [
  {
    id: "connect-channels",
    titleTh: "เชื่อมช่อง YouTube, Instagram และ TikTok",
    titleEn: "Connect YouTube, Instagram and TikTok",
    status: "now",
    descriptionTh: "เชื่อมบัญชีของคุณเองแล้วจัดการจากหน้าเดียว",
  },
  {
    id: "scheduled-posts",
    titleTh: "ตั้งเวลาโพสต์",
    titleEn: "Scheduled posts",
    status: "now",
    descriptionTh: "ตั้งเวลาโพสต์คลิปล่วงหน้าไปยังช่องที่เชื่อมไว้",
  },
  {
    id: "comment-auto-reply",
    titleTh: "ตอบคอมเมนต์อัตโนมัติ",
    titleEn: "Comment auto-reply",
    status: "now",
    descriptionTh: "Instagram ตอบคอมเมนต์เป็น DM และ TikTok ตอบคอมเมนต์แบบสาธารณะ",
  },
  {
    id: "free-skills",
    titleTh: "skill ฟรี",
    titleEn: "Free skills",
    status: "now",
    descriptionTh: "What If Lab, Podcast Shorts, Make Short และ EGM โหลดได้เมื่อเข้าสู่ระบบ",
  },
  {
    id: "deep-sea-docs",
    titleTh: "Deep Sea Docs สำหรับสมาชิก",
    titleEn: "Deep Sea Docs for members",
    status: "now",
    descriptionTh: "ชุดทำคลิปสารคดีใต้ทะเลลึก สำหรับสมาชิก",
  },
  {
    id: "online-payment",
    titleTh: "จ่ายเงินออนไลน์",
    titleEn: "Online payment (card / PromptPay month pass)",
    status: "next",
    descriptionTh: "จ่ายทีละเดือนด้วยบัตรหรือพร้อมเพย์",
  },
  {
    id: "social-mcp",
    titleTh: "kubcode MCP สำหรับโซเชียล",
    titleEn: "kubcode MCP for Social",
    status: "next",
    descriptionTh: "ให้ Claude Code หรือ Codex ตั้งเวลาโพสต์และตั้งกฎตอบคอมเมนต์จากแชต จะรวมอยู่ในแพ็กเกจโซเชียล",
  },
  {
    id: "facebook",
    titleTh: "Facebook",
    titleEn: "Facebook",
    status: "next",
    descriptionTh: "เชื่อมเพจ Facebook เพื่อโพสต์และตั้งเวลา",
  },
  {
    id: "more-member-skills",
    titleTh: "skill สำหรับสมาชิกเพิ่มเติม",
    titleEn: "More members-only skills",
    status: "next",
    descriptionTh: "ชุดทำคลิปใหม่สำหรับสมาชิก",
  },
  {
    id: "clip-orders-mcp",
    titleTh: "สั่งทำคลิปผ่าน MCP",
    titleEn: "Order clips through MCP",
    status: "later",
    descriptionTh: "สั่งทำคลิปจาก AI agent ของคุณได้วันละจำนวนหนึ่ง เริ่มจากทีมงานทำให้ก่อน แล้วค่อยเป็นระบบอัตโนมัติ",
  },
  {
    id: "annual-plan",
    titleTh: "แพ็กเกจรายปี",
    titleEn: "Annual plan",
    status: "later",
    descriptionTh: "ตัวเลือกจ่ายทีละปี",
  },
];

export const NOT_YET_LABEL = "ยังไม่เปิด";
export const roadmapItems = (status: RoadmapStatus) => ROADMAP.filter((i) => i.status === status);
