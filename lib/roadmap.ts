/**
 * /roadmap ("แผนที่จะมา"), rendered from this file only.
 *
 * Rules (owner, 2026-11-12):
 * - `now` lists only what works today.
 * - `next` and `later` are not available: the page marks each "ยังไม่เปิด",
 *   promises no price and no date, and gives it a "แจ้งฉันเมื่อเปิด" waitlist
 *   button (`lib/waitlist`, target kind "roadmap").
 * - /pricing never sells a `next` or `later` item (tests/pricing.test.ts).
 * - Copy is the user's benefit, not internal wording.
 */
export type RoadmapStatus = "now" | "next" | "later";
export type RoadmapArea = "post" | "comment" | "skill" | "payment" | "agent";
/** lucide icon names used on the page (mapped in app/roadmap/icons.tsx). */
export type RoadmapIcon =
  | "link"
  | "calendar-clock"
  | "message-circle-reply"
  | "package-open"
  | "waves"
  | "credit-card"
  | "bot"
  | "facebook"
  | "sparkles"
  | "clapperboard"
  | "calendar-range";

export type RoadmapItem = {
  id: string;
  titleTh: string;
  titleEn: string;
  status: RoadmapStatus;
  area: RoadmapArea;
  icon: RoadmapIcon;
  /** One line: what the user gets. */
  valueTh: string;
  /** Optional link to where it lives today (now items only). */
  href?: string;
};

export const AREA_LABELS: Record<RoadmapArea, string> = {
  post: "โพสต์",
  comment: "คอมเมนต์",
  skill: "skill",
  payment: "ชำระเงิน",
  agent: "AI agent",
};

export const ROADMAP_SECTIONS: readonly { status: RoadmapStatus; titleTh: string; titleEn: string; leadTh: string }[] = [
  { status: "now", titleTh: "ตอนนี้ใช้ได้", titleEn: "Now", leadTh: "ใช้งานได้แล้ววันนี้" },
  { status: "next", titleTh: "กำลังทำ", titleEn: "Next", leadTh: "กำลังสร้าง ยังไม่เปิดให้ใช้" },
  { status: "later", titleTh: "ในอนาคต", titleEn: "Later", leadTh: "วางแผนไว้ ยังไม่เริ่มสร้าง" },
];

export const ROADMAP: readonly RoadmapItem[] = [
  {
    id: "connect-channels",
    titleTh: "เชื่อมช่อง YouTube, Instagram และ TikTok",
    titleEn: "Connect YouTube, Instagram and TikTok",
    status: "now",
    area: "post",
    icon: "link",
    valueTh: "ทุกช่องของคุณอยู่ในหน้าเดียว ไม่ต้องสลับแอป",
    href: "/account/channels",
  },
  {
    id: "scheduled-posts",
    titleTh: "ตั้งเวลาโพสต์",
    titleEn: "Scheduled posts",
    status: "now",
    area: "post",
    icon: "calendar-clock",
    valueTh: "ทำคลิปเสร็จเมื่อไหร่ก็ตั้งไว้ ให้ขึ้นตอนที่คนดูออนไลน์",
  },
  {
    id: "comment-auto-reply",
    titleTh: "ตอบคอมเมนต์อัตโนมัติ",
    titleEn: "Comment auto-reply",
    status: "now",
    area: "comment",
    icon: "message-circle-reply",
    valueTh: "คนพิมพ์คำที่ตั้งไว้ ได้ DM ใน Instagram หรือคำตอบใน TikTok ทันที",
  },
  {
    id: "free-skills",
    titleTh: "skill ฟรี 4 ชุด",
    titleEn: "Four free skills",
    status: "now",
    area: "skill",
    icon: "package-open",
    valueTh: "ให้ AI agent ในเครื่องคุณทำคลิปแนวเดียวกับตัวอย่าง",
    href: "/",
  },
  {
    id: "deep-sea-docs",
    titleTh: "Deep Sea Docs สำหรับสมาชิก",
    titleEn: "Deep Sea Docs for members",
    status: "now",
    area: "skill",
    icon: "waves",
    valueTh: "ชุดทำคลิปสารคดีใต้ทะเลลึก เขียนเองโดย kubcode",
    href: "/skills/deep-sea-docs",
  },
  {
    id: "online-payment",
    titleTh: "จ่ายเงินออนไลน์",
    titleEn: "Online payment",
    status: "next",
    area: "payment",
    icon: "credit-card",
    valueTh: "สมัครแพ็กเกจเองด้วยบัตรหรือพร้อมเพย์ จ่ายทีละเดือน",
  },
  {
    id: "social-mcp",
    titleTh: "kubcode MCP สำหรับโซเชียล",
    titleEn: "kubcode MCP for Social",
    status: "next",
    area: "agent",
    icon: "bot",
    valueTh: "สั่ง Claude Code หรือ Codex ให้ตั้งเวลาโพสต์และกฎตอบคอมเมนต์จากแชต",
  },
  {
    id: "facebook",
    titleTh: "Facebook",
    titleEn: "Facebook",
    status: "next",
    area: "post",
    icon: "facebook",
    valueTh: "ตั้งเวลาโพสต์ลงเพจ Facebook จากที่เดียวกับช่องอื่น",
  },
  {
    id: "more-member-skills",
    titleTh: "skill สำหรับสมาชิกชุดใหม่",
    titleEn: "More members-only skills",
    status: "next",
    area: "skill",
    icon: "sparkles",
    valueTh: "แนวภาพและแนวเรื่องใหม่ ให้ agent ของคุณทำได้อีก",
  },
  {
    id: "clip-orders-mcp",
    titleTh: "สั่งทำคลิปผ่าน MCP",
    titleEn: "Order clips through MCP",
    status: "later",
    area: "agent",
    icon: "clapperboard",
    valueTh: "บอก agent ว่าอยากได้คลิปแบบไหน แล้วรอรับคลิปเสร็จ",
  },
  {
    id: "annual-plan",
    titleTh: "แพ็กเกจรายปี",
    titleEn: "Annual plan",
    status: "later",
    area: "payment",
    icon: "calendar-range",
    valueTh: "จ่ายครั้งเดียวใช้ได้ทั้งปี ไม่ต้องต่ออายุทุกเดือน",
  },
];

/**
 * The two large feature sections at the top. Each points at a roadmap item,
 * so its status and waitlist come from the same row.
 */
export const BIG_BETS: readonly { itemId: string; kickerTh: string; headlineTh: string; bodyTh: string }[] = [
  {
    itemId: "social-mcp",
    kickerTh: "kubcode MCP",
    headlineTh: "สั่งงานโซเชียลจากแชตกับ AI agent",
    bodyTh:
      "พิมพ์บอก Claude Code หรือ Codex เป็นภาษาคน แล้ว agent ตั้งเวลาโพสต์และกฎตอบคอมเมนต์ให้ในบัญชี kubcode ของคุณ จะรวมอยู่ในแพ็กเกจโซเชียล",
  },
  {
    itemId: "clip-orders-mcp",
    kickerTh: "สั่งทำคลิป",
    headlineTh: "บอกว่าอยากได้คลิปแบบไหน แล้วรอรับ",
    bodyTh: "สั่งทำคลิปจาก agent ได้วันละจำนวนหนึ่ง ช่วงแรกทีมงานทำให้เอง แล้วค่อยเปลี่ยนเป็นระบบอัตโนมัติ",
  },
];

export const NOT_YET_LABEL = "ยังไม่เปิด";
/** Waitlist counts below this are not shown (no "1 คนรออยู่"). */
export const WAITLIST_COUNT_MIN = 5;

export const roadmapItems = (status: RoadmapStatus) => ROADMAP.filter((i) => i.status === status);
export const roadmapItem = (id: string) => ROADMAP.find((i) => i.id === id);
