// How each plan from lib/plans.ts is presented on /pricing (owner,
// 2026-11-14). Prices, status and features stay in lib/plans.ts; this file
// only adds the look: icon, family colour and a one-line "เหมาะกับ".
import type { Plan, ProductFamily } from "@/lib/plans";

export type PlanLook = {
  /** lucide icon name, resolved in PlanIcon. */
  icon: "gift" | "messages" | "clapperboard" | "layers";
  /** One line: who the plan is for. */
  fitTh: string;
};

export const PLAN_LOOK: Readonly<Record<string, PlanLook>> = {
  free: { icon: "gift", fitTh: "เหมาะกับคนที่อยากลองทำคลิปด้วย skill ฟรีก่อน" },
  social: { icon: "messages", fitTh: "เหมาะกับคนที่มีช่องแล้ว อยากให้โพสต์และตอบคอมเมนต์เอง" },
  "skill-pack": { icon: "clapperboard", fitTh: "เหมาะกับคนทำคลิปที่อยากได้สไตล์ใหม่ ๆ ทุกเดือน" },
  "social-skill": { icon: "layers", fitTh: "เหมาะกับคนที่ทั้งทำคลิปและดูแลช่องเอง" },
};

export const lookOf = (p: Plan): PlanLook => PLAN_LOOK[p.id] ?? { icon: "gift", fitTh: p.summaryTh };

/** Which product filter a plan belongs to; Free is part of both. */
export const inFamily = (p: Plan, f: ProductFamily | "all") => f === "all" || p.families.length === 0 || p.families.includes(f);

/** Thai baht with a thousands separator, the way the cards print prices. */
export const thb = (n: number) => `${n.toLocaleString("en-US")} ฿`;

/** Monthly total for N channels on a channel plan (first channel(s) + extras). */
export function monthlyTotal(p: Plan, channels: number): number {
  if (p.channelsIncluded === 0 || p.extraChannelThb === null) return p.priceThb;
  const extra = Math.max(0, channels - p.channelsIncluded);
  return p.priceThb + extra * p.extraChannelThb;
}
