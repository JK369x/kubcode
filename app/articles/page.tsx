import type { Metadata } from "next";
import { ArticleIndex } from "@/components/ArticleIndex";
import { getContent } from "@/lib/content";
import { metadataFor } from "@/lib/seo";

export const metadata: Metadata = metadataFor({
  title: "บทความ — อ่านก่อนลงมือทำคลิป",
  description: "บทความสอนทำคลิปด้วย AI เลือกเครื่องมือ เบื้องหลังคลิป และเรื่องสิทธิ์ที่ต้องรู้ แยกตามหมวด",
  path: "/articles",
});

export default function Articles() {
  return <ArticleIndex content={getContent()} />;
}
