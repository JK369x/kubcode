/**
 * "เพิ่งปล่อย" on /roadmap: real entries from `git log origin/main`, newest
 * first, in user-facing Thai. `pr` is the merged PR number on JK369x/kubcode;
 * `date` is the merge date in Asia/Bangkok. Add an entry when a user-visible
 * PR merges. tests/roadmap.test.ts checks order and shape.
 */
export type ChangelogEntry = {
  date: string;
  pr: number;
  titleTh: string;
  detailTh: string;
  href?: string;
};

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    date: "2026-11-12",
    pr: 85,
    titleTh: "หน้าแรกแบบใหม่",
    detailTh: "คลิปตัวอย่างเล่นในจอโทรศัพท์ พร้อมพาดหัวแบบพิมพ์ทีละตัว",
    href: "/",
  },
  {
    date: "2026-11-12",
    pr: 83,
    titleTh: "หน้าตาใหม่ทั้งเว็บ",
    detailTh: "ปุ่ม การ์ด ฟอร์ม และเมนูชุดใหม่ ใช้ง่ายขึ้นบนมือถือ ทั้งโหมดมืดและสว่าง",
  },
  {
    date: "2026-11-12",
    pr: 78,
    titleTh: "What If Lab 0.2.0 และ Deep Sea Docs",
    detailTh: "What If Lab รุ่นใหม่สำหรับคลิปแนวตั้ง และชุดสารคดีใต้ทะเลสำหรับสมาชิก",
    href: "/skills/deep-sea-docs",
  },
  {
    date: "2026-11-11",
    pr: 75,
    titleTh: "บทความ DeepSeek Harness",
    detailTh: "ใช้ Claude และ Codex แบบสมัครสมาชิกบน Mac ผ่าน DeepSeek Harness",
    href: "/articles/deepseek-harness-subscriptions",
  },
  {
    date: "2026-11-11",
    pr: 72,
    titleTh: "ติดตั้งด้วย AI agent ของคุณ",
    detailTh: "คัดลอก prompt เดียวไปวางใน agent ของคุณ แล้วให้มันติดตั้งชุดเครื่องมือให้",
  },
  {
    date: "2026-11-11",
    pr: 71,
    titleTh: "เลือกโพสต์จากรายการ",
    detailTh: "ตั้งกฎตอบคอมเมนต์โดยเลือกจากโพสต์ล่าสุดของช่อง ไม่ต้องพิมพ์รหัสโพสต์",
  },
  {
    date: "2026-11-11",
    pr: 69,
    titleTh: "เชื่อม TikTok",
    detailTh: "เชื่อมช่อง TikTok โพสต์คลิปแนวตั้ง และตอบคอมเมนต์ตามคำที่ตั้งไว้",
  },
  {
    date: "2026-11-11",
    pr: 67,
    titleTh: "ดาวและคอมเมนต์ในบทความ",
    detailTh: "ให้ดาวและคุยกันได้ในทุกบทความ พร้อมหน้าชุมชนที่รวมคอมเมนต์ล่าสุด",
    href: "/community",
  },
  {
    date: "2026-11-10",
    pr: 65,
    titleTh: "กรองตามแนวภาพและแนวเรื่อง",
    detailTh: "เลือกแนวภาพกับแนวเรื่องแยกกัน หาคลิปที่อยากทำได้เร็วขึ้น",
    href: "/",
  },
  {
    date: "2026-11-10",
    pr: 64,
    titleTh: "Elephant-Goldfish Model",
    detailTh: "บทความ หน้าเครื่องมือ และ skill ฟรีจาก Google",
    href: "/articles/elephant-goldfish-model",
  },
  {
    date: "2026-11-10",
    pr: 60,
    titleTh: "Instagram คอมเมนต์ → DM",
    detailTh: "คนคอมเมนต์คำที่ตั้งไว้ ได้ DM พร้อมลิงก์อัตโนมัติ",
  },
];

/** Facts for the hero, counted from the repo on `asOf` (see tests). */
export const ROADMAP_STATS = {
  asOf: "2026-11-12",
  /** PRs merged into main in November 2026 (git log origin/main). */
  prsThisMonth: 83,
} as const;
