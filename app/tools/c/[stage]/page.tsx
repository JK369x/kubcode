import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolIndex } from "@/components/ToolIndex";
import { getContent, TOOL_CATEGORIES, type ToolCategory } from "@/lib/content";
import { CATEGORY_LABELS } from "@/lib/kb-labels";
import { breadcrumbJsonLd, metadataFor, stageIsIndexable } from "@/lib/seo";
import { stageHref } from "@/lib/tool-index";
import { JsonLd } from "@/components/JsonLd";

export const dynamicParams = false;

/** One page per stage that has tools; empty stages 404. */
export function generateStaticParams() {
  const { tools } = getContent();
  return TOOL_CATEGORIES.filter((c) => tools.some((t) => t.category === c)).map((stage) => ({ stage }));
}

type Props = { params: Promise<{ stage: string }> };

const asStage = (s: string) => (TOOL_CATEGORIES as readonly string[]).includes(s) ? (s as ToolCategory) : undefined;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const stage = asStage((await params).stage);
  if (!stage) return {};
  return metadataFor({
    title: `${CATEGORY_LABELS[stage]} — เครื่องมือ kubcode`,
    description: `เครื่องมือขั้น${CATEGORY_LABELS[stage]}ที่เราใช้ทำคลิป พร้อมหมายเหตุไลเซนส์ ราคา และลิงก์ต้นทาง`,
    path: stageHref(stage),
    noindex: !stageIsIndexable(getContent(), stage),
  });
}

export default async function StagePage({ params }: Props) {
  const stage = asStage((await params).stage);
  if (!stage) notFound();
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "kubcode", path: "/" },
          { name: "เครื่องมือ", path: "/tools" },
          { name: CATEGORY_LABELS[stage], path: stageHref(stage) },
        ])}
      />
      <ToolIndex content={getContent()} stage={stage} />
    </>
  );
}
