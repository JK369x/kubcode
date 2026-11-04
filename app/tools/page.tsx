import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { breadcrumbJsonLd, metadataFor } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { ToolIndex } from "@/components/ToolIndex";

export const metadata: Metadata = metadataFor({
  title: "เครื่องมือทำคลิปที่เราใช้จริง",
  description:
    "รวมเครื่องมือที่ใช้ทำคลิป ตั้งแต่เขียนบท เสียง เรนเดอร์ ไปจนถึงซับไตเติล พร้อมหมายเหตุไลเซนส์และลิงก์ต้นทาง",
  path: "/tools",
});

export default function Tools() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "kubcode", path: "/" },
          { name: "เครื่องมือ", path: "/tools" },
        ])}
      />
      <ToolIndex content={getContent()} />
    </>
  );
}
