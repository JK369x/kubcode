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
    date: "2026-11-23",
    pr: 141,
    titleTh: "ปุ่มอัปเดตบนเมนู",
    detailTh: "ปุ่ม อัปเดต บอกว่ามีอะไรใหม่ที่คุณยังไม่ได้ดู และปุ่ม เริ่มใช้งาน สำหรับคนที่ยังไม่มีบัญชี",
    href: "/roadmap#shipped-h",
  },
  {
    date: "2026-11-23",
    pr: 139,
    titleTh: "แดชบอร์ด Social",
    detailTh: "ดูโพสต์ที่ตั้งเวลาไว้ ที่เผยแพร่แล้ว และคอมเมนต์ที่ kubcode ตอบให้ แยกตามช่อง",
    href: "/account",
  },
  {
    date: "2026-11-23",
    pr: 138,
    titleTh: "หน้าแรกเน้น Social",
    detailTh: "เปิดมาเจอการตั้งเวลาโพสต์และตอบคอมเมนต์ก่อน ส่วนสกิลทำคลิปยังอยู่ในแท็บ Studio",
    href: "/",
  },
  {
    date: "2026-11-19",
    pr: 137,
    titleTh: "โลโก้โมเดลบนการ์ดคลิป",
    detailTh: "การ์ดคลิปบอกว่าทำด้วย agent และโมเดลไหน พร้อมไอคอน",
  },
  {
    date: "2026-11-18",
    pr: 135,
    titleTh: "สกิล Stickman Canvas",
    detailTh: "ชุดทำคลิปตัวละครเส้นของเราเอง โหลดได้สำหรับสมาชิก",
    href: "/skills/stickman-canvas",
  },
  {
    date: "2026-11-18",
    pr: 134,
    titleTh: "บทความ React Vibe",
    detailTh: "คอมโพเนนต์แอนิเมชัน React แบบก๊อปไปวาง ที่เราลองใช้จริง",
    href: "/articles/react-vibe-motion",
  },
  {
    date: "2026-11-17",
    pr: 133,
    titleTh: "สกิลใหม่ 3 ชุด",
    detailTh: "Low-poly Urban, เสียงพากย์ไทย Thai Calm Narrator และซับไตเติล Captions Overlay",
  },
  {
    date: "2026-11-17",
    pr: 121,
    titleTh: "เชื่อม Facebook Page",
    detailTh: "ตั้งเวลาโพสต์ Reels ลง Facebook Page ได้จากหน้าเดียวกับช่องอื่น",
    href: "/account/channels",
  },
  {
    date: "2026-11-16",
    pr: 111,
    titleTh: "ตอบคอมเมนต์ชัดขึ้น",
    detailTh: "เห็นจำนวนคอมเมนต์ของแต่ละโพสต์ และคอมเมนต์ที่ยังไม่ตรงคีย์เวิร์ด",
  },
  {
    date: "2026-11-16",
    pr: 103,
    titleTh: "โพสต์จากหน้าเว็บ",
    detailTh: "อัปโหลดคลิปครั้งเดียว แล้วโพสต์หรือตั้งเวลาลงหลายช่องพร้อมกัน",
    href: "/account/posts/new",
  },
  {
    date: "2026-11-15",
    pr: 100,
    titleTh: "หน้าราคาใหม่",
    detailTh: "เทียบแพ็กเกจ Studio และ Social ได้ในหน้าเดียว",
    href: "/pricing",
  },
];

/** Facts for the hero, counted from the repo on `asOf` (see tests). */
export const ROADMAP_STATS = {
  asOf: "2026-11-23",
  /** PRs merged into main in November 2026 (git log origin/main). */
  prsThisMonth: 126,
} as const;
