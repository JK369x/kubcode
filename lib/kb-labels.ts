import type { Pricing, ToolCategory } from "./content";

/** Thai labels for the eight production stages, in pipeline order. */
export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  script: "เขียนบทและโค้ด",
  image: "ภาพ",
  voice: "เสียงพากย์",
  music: "เพลงและเสียงประกอบ",
  render: "เรนเดอร์วิดีโอ",
  captions: "ซับไตเติล",
  package: "รวมไฟล์และแปลงไฟล์",
  publish: "เผยแพร่",
};

/** Badge text for a tool's price model. */
export const PRICING_LABELS: Record<Pricing, string> = {
  free: "ฟรี",
  "free-tier": "มีแผนฟรี",
  paid: "เสียเงิน",
};
