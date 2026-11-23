import { OG_SIZE, ogImage } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "kubcode — ตั้งเวลาโพสต์และตอบคอมเมนต์อัตโนมัติ";

export default async function Image() {
  return ogImage({
    eyebrow: "kubcode",
    title: "ตั้งเวลาโพสต์และตอบคอมเมนต์อัตโนมัติ",
    description: "YouTube, Instagram, TikTok จากที่เดียว คอมเมนต์คีย์เวิร์ดได้ลิงก์ทาง DM",
  });
}
