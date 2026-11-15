// Feature comparison on /pricing. Every row restates something the plan
// cards already say (lib/plans.ts features); nothing here is sold that the
// cards do not sell. Order follows PLANS: free, social, skill-pack, social-skill.
export type Cell = boolean | string;
export type CompareRow = {
  icon: "book" | "download" | "link" | "calendar" | "send" | "reply" | "clapperboard";
  labelTh: string;
  cells: Readonly<Record<string, Cell>>;
};
export type CompareGroup = { titleTh: string; rows: readonly CompareRow[] };

export const COMPARE: readonly CompareGroup[] = [
  {
    titleTh: "อ่านและเรียนรู้",
    rows: [
      { icon: "book", labelTh: "บทความ หน้าเครื่องมือ ให้ดาวและคอมเมนต์", cells: { free: true, social: true, "skill-pack": true, "social-skill": true } },
      { icon: "download", labelTh: "skill ฟรี (What If Lab, Podcast Shorts, Make Short, EGM)", cells: { free: true, social: true, "skill-pack": true, "social-skill": true } },
    ],
  },
  {
    titleTh: "kubcode Social",
    rows: [
      { icon: "link", labelTh: "เชื่อมช่อง YouTube, Instagram, TikTok", cells: { free: false, social: "ตามจำนวนช่อง", "skill-pack": false, "social-skill": "ตามจำนวนช่อง" } },
      { icon: "calendar", labelTh: "ตั้งเวลาโพสต์", cells: { free: false, social: "ไม่จำกัด", "skill-pack": false, "social-skill": "ไม่จำกัด" } },
      { icon: "send", labelTh: "Instagram: คอมเมนต์คีย์เวิร์ด → DM", cells: { free: false, social: true, "skill-pack": false, "social-skill": true } },
      { icon: "reply", labelTh: "TikTok: ตอบคอมเมนต์แบบสาธารณะ", cells: { free: false, social: true, "skill-pack": false, "social-skill": true } },
    ],
  },
  {
    titleTh: "kubcode Studio",
    rows: [
      { icon: "clapperboard", labelTh: "skill สำหรับสมาชิก (Deep Sea Docs และชุดใหม่)", cells: { free: false, social: false, "skill-pack": true, "social-skill": true } },
    ],
  },
];
