// kubcode's two product families (owner, 2026-11-13) and what the hero says
// for each. Names live here (and in lib/plans.ts PRODUCT_FAMILIES on the
// pricing branch) so they can be renamed in one place.
export type ProductId = "studio" | "social";
export const PRODUCT_IDS: readonly ProductId[] = ["studio", "social"];

export type ProductCopy = {
  name: string;
  /** Short label in the hero switch. */
  tab: string;
  eyebrow: string;
  line1: string;
  /** Phrases line 2 types in turn (Studio: driven by the selected clip instead). */
  line2: readonly string[];
  lead: string;
  points: readonly string[];
  cta: { label: string; href: string };
};

export const PRODUCTS: Readonly<Record<ProductId, ProductCopy>> = {
  studio: {
    name: "kubcode Studio",
    tab: "ทำคลิป",
    eyebrow: "kubcode Studio · ทำคลิปด้วย AI",
    line1: "เห็นคลิปไหนถูกใจ",
    line2: [],
    lead: "ทุกคลิปในจอนี้ทำด้วยสกิลบน kubcode กับ AI agent ในคอมคุณเอง ไม่ต้องตัดต่อเอง",
    points: [
      "สกิลฟรีให้โหลด ใช้กับ Claude Code หรือ OpenCode",
      "สกิลและสไตล์สำหรับสมาชิกเพิ่มให้เรื่อย ๆ",
      "เหมาะกับคนอยากทำคลิปสั้นเองแบบไม่ต้องตัดต่อ",
    ],
    cta: { label: "เริ่มทำคลิปแรก", href: "#get-started" },
  },
  social: {
    name: "kubcode Social",
    tab: "โพสต์และตอบคอมเมนต์",
    eyebrow: "kubcode Social · โพสต์และตอบคอมเมนต์",
    line1: "คลิปเสร็จแล้ว",
    line2: ["ให้ kubcode โพสต์ให้", "ให้ kubcode ตอบคอมเมนต์ให้", "ให้ kubcode ส่งลิงก์ทาง DM"],
    lead: "เชื่อมช่องครั้งเดียว ตั้งเวลาโพสต์ลง YouTube, Instagram และ TikTok จากที่เดียว แล้วให้ระบบตอบคนที่คอมเมนต์คีย์เวิร์ดที่คุณตั้งไว้",
    points: [
      "ตั้งเวลาโพสต์ทุกช่องจากหน้าเดียว",
      "Instagram: คอมเมนต์คีย์เวิร์ด ได้ DM พร้อมลิงก์",
      "TikTok: ตอบใต้คอมเมนต์คีย์เวิร์ดแบบสาธารณะ",
    ],
    cta: { label: "เชื่อมช่องของคุณ", href: "/account/channels" },
  },
};

/** ?product=studio|social; anything else is the default (studio). */
export const productFromSearch = (search: string): ProductId =>
  new URLSearchParams(search).get("product") === "social" ? "social" : "studio";
