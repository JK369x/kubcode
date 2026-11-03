import { OG_SIZE, ogImage } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "kubcode — คลังทักษะและงานทดลอง";

export default async function Image() {
  return ogImage({
    eyebrow: "kubcode",
    title: "คลังทักษะและงานทดลองทำคลิปด้วย AI",
    description: "ดูตัวอย่างจริง เข้าใจเครื่องมือ และอ่านก่อนใช้งาน",
  });
}
