"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { PlatformLogo, type Platform } from "@/components/PlatformLogo";
import { send } from "@/lib/interactions/client";
import type { DeliveryView, PostView } from "@/lib/posts/store";

const STATUS: Record<DeliveryView["status"], { label: string; variant: "ok" | "warn" | "info" | "neutral" }> = {
  pending: { label: "กำลังส่ง", variant: "info" },
  scheduled: { label: "ตั้งเวลาแล้ว", variant: "info" },
  publishing: { label: "กำลังเผยแพร่", variant: "info" },
  published: { label: "เผยแพร่แล้ว", variant: "ok" },
  failed: { label: "ล้มเหลว", variant: "warn" },
  rejected: { label: "ไม่ผ่านการตรวจ", variant: "warn" },
  cancelled: { label: "ยกเลิกแล้ว", variant: "neutral" },
};

/** Fixed error codes → short Thai reasons (anything else shows the code). */
const REASON: Record<string, string> = {
  video_not_9_16: "วิดีโอต้องเป็นแนวตั้ง 9:16",
  video_too_long: "วิดีโอยาวเกินที่แพลตฟอร์มรับ",
  video_too_large: "ไฟล์ใหญ่เกินที่แพลตฟอร์มรับ",
  cover_missing: "ต้องมีภาพปก",
  title_empty: "ต้องมีชื่อคลิป",
  title_too_long: "ชื่อคลิปยาวเกิน",
  description_too_long: "แคปชันยาวเกิน",
  visibility_unsupported: "แพลตฟอร์มนี้ไม่รองรับการซ่อนโพสต์",
  hourly_limit: "โพสต์ถี่เกินในชั่วโมงนี้",
  daily_limit: "ครบจำนวนโพสต์ต่อวันแล้ว",
  needs_reconnect: "ต้องเชื่อมช่องใหม่",
  channel_paused: "ช่องถูกพักไว้ (แพ็กเกจ)",
  platform_rejected: "แพลตฟอร์มปฏิเสธโพสต์",
  options_platform: "ตัวเลือกไม่ตรงกับแพลตฟอร์ม",
  first_comment_invalid: "คอมเมนต์แรกไม่ถูกต้อง",
  category_invalid: "หมวดหมู่ YouTube ไม่ถูกต้อง",
};

const OPTION_LABEL: Record<string, string> = {
  allow_comment: "คอมเมนต์",
  allow_duet: "Duet",
  allow_stitch: "Stitch",
  draft: "ส่งเป็นร่าง",
  share_to_feed: "แสดงบนโปรไฟล์",
  comments_enabled: "คอมเมนต์",
  ai_generated: "ป้าย AI",
  first_comment: "คอมเมนต์แรก",
  made_for_kids: "สำหรับเด็ก",
  synthetic_media: "เนื้อหา AI",
  category_id: "หมวดหมู่",
  notify_subscribers: "แจ้งผู้ติดตาม",
};

const bkk = (iso: string) => new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
const isPlatform = (p: string): p is Platform => ["youtube", "instagram", "tiktok", "facebook"].includes(p);

export function PostsList({ posts: initial }: { posts: PostView[] }) {
  const router = useRouter();
  const [posts, setPosts] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  async function cancel(d: DeliveryView) {
    if (!window.confirm(`ยกเลิกโพสต์ที่ตั้งเวลาไว้ลง ${d.channelName} ใช่ไหม?`)) return;
    setBusy(d.id);
    const r = await send("/api/posts/cancel", "POST", { deliveryId: d.id });
    setBusy(null);
    if (!r.ok) return toast.error(r.message);
    toast.success("ยกเลิกแล้ว");
    setPosts((ps) => ps.map((p) => ({ ...p, deliveries: p.deliveries.map((x) => (x.id === d.id ? { ...x, status: "cancelled" as const } : x)) })));
    router.refresh();
  }
  if (posts.length === 0)
    // Empty state (UX audit P1-7): logos, what happens, one primary action.
    return (
      <div className="grid justify-items-center gap-4 rounded-[22px] border border-dashed border-input px-6 py-12 text-center">
        <span className="flex gap-2.5" aria-hidden="true">
          {(["youtube", "instagram", "tiktok"] as const).map((pl) => (
            <span key={pl} className="grid size-11 place-items-center rounded-[14px] border border-input bg-background">
              <PlatformLogo platform={pl} size={20} decorative />
            </span>
          ))}
        </span>
        <p className="m-0 max-w-[34em] text-[15px] leading-[1.65] text-muted-foreground">
          ยังไม่มีโพสต์ อัปโหลดคลิปครั้งเดียว แล้วเลือกโพสต์ทันทีหรือตั้งเวลาลงหลายช่องพร้อมกัน
        </p>
        <Button asChild size="lg" className="rounded-full font-semibold">
          <Link href="/account/posts/new">
            <Send aria-hidden className="size-4" /> สร้างโพสต์แรก
          </Link>
        </Button>
      </div>
    );
  return (
    <ul className="m-0 grid list-none gap-4 p-0">
      {posts.map((p) => (
        <li key={p.id} className="grid gap-3 rounded-[22px] border border-input bg-card/90 p-5">
          <div className="flex items-start gap-3">
            <span className="flex shrink-0 -space-x-1.5 pt-0.5" aria-hidden="true">
              {Array.from(new Set(p.deliveries.map((d) => d.platform)))
                .filter(isPlatform)
                .map((pl) => (
                  <span key={pl} className="grid size-8 place-items-center rounded-full border border-input bg-background">
                    <PlatformLogo platform={pl} size={16} decorative />
                  </span>
                ))}
            </span>
            <p className="m-0 line-clamp-3 min-w-0 text-[15px] leading-[1.6] whitespace-pre-line">{p.caption || "(ไม่มีแคปชัน)"}</p>
          </div>
          <ul className="m-0 grid list-none gap-2 p-0">
            {p.deliveries.map((d) => {
              const st = STATUS[d.status] ?? STATUS.pending;
              const canCancel = d.status === "scheduled" || d.status === "pending";
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 text-[14px]">
                  {isPlatform(d.platform) ? <PlatformLogo platform={d.platform} size={18} /> : null}
                  <span className="min-w-0 font-medium">{d.channelName}</span>
                  <Badge variant={st.variant}>{st.label}</Badge>
                  <span className="text-muted-foreground">{bkk(d.publishAt)}</span>
                  {(d.caption || d.options.length > 0) && (
                    <span className="basis-full text-[13px] text-muted-foreground">
                      {d.caption ? "แคปชันแยก" : ""}
                      {d.caption && d.options.length ? " · " : ""}
                      {d.options.length ? `ปรับตัวเลือก ${d.options.map((k) => OPTION_LABEL[k] ?? k).join(", ")}` : ""}
                    </span>
                  )}
                  {d.error && (d.status === "failed" || d.status === "rejected") && (
                    <span className="basis-full text-[13px] text-[#92400e] dark:text-[#fcd34d]">เหตุผล: {REASON[d.error] ?? d.error}</span>
                  )}
                  <span className="ml-auto flex items-center gap-2">
                    {d.url && (
                      <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1">
                        ดูโพสต์ <ExternalLink aria-hidden className="size-4" />
                      </a>
                    )}
                    {canCancel && (
                      <Button type="button" variant="outline" size="sm" disabled={busy === d.id} onClick={() => void cancel(d)}>
                        ยกเลิก
                      </Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
