import type { ToolCategory } from "./content";

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
