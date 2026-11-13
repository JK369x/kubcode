/**
 * Plans shown on /pricing (ADR 0007). The page renders this list only, so a
 * tier change is a data change here, not a markup change.
 *
 * `status`:
 * - "available": sold now (paid ones open for payment when billing ships).
 * - "coming_soon": shown with price and features, a "เร็ว ๆ นี้" badge and a
 *   "แจ้งฉันเมื่อเปิด" waitlist button. Never purchasable; tests check this.
 */
export type PlanStatus = "available" | "coming_soon";

/**
 * kubcode's two product families (owner, 2026-11-13). One place to rename
 * them; the home page hero uses the same names (lib/products.ts on the home
 * branch).
 */
export const PRODUCT_FAMILIES = {
  studio: "kubcode Studio",
  social: "kubcode Social",
} as const;
export type ProductFamily = keyof typeof PRODUCT_FAMILIES;

export type Plan = {
  id: string;
  nameTh: string;
  nameEn: string;
  status: PlanStatus;
  /** Monthly price in whole baht for `channelsIncluded` channels (0 = free). */
  priceThb: number;
  /** Channels included in `priceThb` (0 for plans without channels). */
  channelsIncluded: number;
  /** Monthly price of each channel beyond `channelsIncluded`; null when no channels are sold. */
  extraChannelThb: number | null;
  summaryTh: string;
  features: readonly string[];
  /** At most one plan is highlighted. */
  highlighted: boolean;
  /** Product families the plan covers, shown under its name. */
  families: readonly ProductFamily[];
};

export const PLANS: readonly Plan[] = [
  {
    id: "free",
    nameTh: "ฟรี",
    nameEn: "Free",
    status: "available",
    priceThb: 0,
    channelsIncluded: 0,
    extraChannelThb: null,
    summaryTh: "อ่าน เรียนรู้ และโหลด skill ฟรี",
    features: [
      "อ่านบทความและหน้าเครื่องมือทั้งหมด",
      "ให้ดาวและคอมเมนต์",
      "ดาวน์โหลด skill ฟรีเมื่อเข้าสู่ระบบ: What If Lab, Podcast Shorts, Make Short และ EGM (MIT / Apache-2.0)",
    ],
    highlighted: false,
    families: [],
  },
  {
    id: "social",
    nameTh: "โซเชียล",
    nameEn: "Social",
    status: "available",
    priceThb: 289,
    channelsIncluded: 1,
    extraChannelThb: 289,
    summaryTh: "ตั้งเวลาโพสต์และตอบคอมเมนต์อัตโนมัติ จ่ายตามจำนวนช่อง",
    features: [
      "เชื่อมช่อง YouTube, Instagram และ TikTok ได้ตั้งแต่ 1 ช่องขึ้นไป",
      "ตั้งเวลาโพสต์ได้ไม่จำกัด",
      "ตอบคอมเมนต์อัตโนมัติ: Instagram ตอบเป็น DM, TikTok ตอบเป็นคอมเมนต์สาธารณะ",
      "ทุกอย่างในแพ็กเกจฟรี",
      "ไม่รวม skill สำหรับสมาชิก",
    ],
    highlighted: true,
    families: ["social"],
  },
  {
    id: "skill-pack",
    nameTh: "สกิลแพ็ก",
    nameEn: "Skill Pack",
    status: "coming_soon",
    priceThb: 149,
    channelsIncluded: 0,
    extraChannelThb: null,
    summaryTh: "skill สำหรับสมาชิก สำหรับคนทำคลิปด้วย AI agent ของตัวเอง",
    features: ["skill สำหรับสมาชิก: Deep Sea Docs และชุดใหม่ที่จะเพิ่มต่อไป", "ทุกอย่างในแพ็กเกจฟรี"],
    highlighted: false,
    families: ["studio"],
  },
  {
    id: "social-skill",
    nameTh: "โซเชียล + สกิล",
    nameEn: "Social + Skill",
    status: "coming_soon",
    priceThb: 389,
    channelsIncluded: 1,
    extraChannelThb: 289,
    summaryTh: "ทุกอย่างในโซเชียลและสกิลแพ็ก ในแพ็กเกจเดียว",
    features: ["ทุกอย่างในแพ็กเกจโซเชียล", "ทุกอย่างในสกิลแพ็ก"],
    highlighted: false,
    families: ["social", "studio"],
  },
];

export const FREE_SKILLS = ["What If Lab", "Podcast Shorts", "Make Short", "EGM"] as const;

const baht = (n: number) => `${n.toLocaleString("en-US")} ฿`;

/** Big price + unit under it. */
export function priceLabel(p: Plan): { amount: string; unit: string } {
  if (p.priceThb === 0) return { amount: "0 ฿", unit: "ฟรีตลอด" };
  if (p.channelsIncluded === 0) return { amount: baht(p.priceThb), unit: "ต่อเดือน" };
  if (p.channelsIncluded === 1 && p.extraChannelThb === p.priceThb) return { amount: baht(p.priceThb), unit: "ต่อช่อง ต่อเดือน" };
  return { amount: baht(p.priceThb), unit: `ต่อเดือน สำหรับ ${p.channelsIncluded === 1 ? "ช่องแรก" : `${p.channelsIncluded} ช่องแรก`}` };
}

/** Extra-channel line, or null when the plan has no channels. */
export function extraChannelLabel(p: Plan): string | null {
  if (p.extraChannelThb === null || p.channelsIncluded === 0) return null;
  if (p.channelsIncluded === 1 && p.extraChannelThb === p.priceThb) return "ทุกช่องราคาเท่ากัน ไม่มีส่วนลดเมื่อเพิ่มช่อง";
  return `ช่องถัดไป +${baht(p.extraChannelThb)} ต่อช่อง ต่อเดือน`;
}

/**
 * Paid sign-up is open only when this is exactly "true". Billing is not built
 * yet (ADR 0007), so available paid plans show a disabled
 * "เปิดให้สมัครเร็ว ๆ นี้" button.
 */
export { BILLING_FLAG } from "./billing/config";
import { readBillingConfig } from "./billing/config";
/** The Social CTA is live only when billing is fully configured (flag + Lambda URL + key). */
export const billingOpen = (env: Record<string, string | undefined> = process.env) => readBillingConfig(env).mode === "on";
