"use client";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PickerPost, PostStats } from "@/lib/automations/posts";

export type StatsState = { state: "loading" } | { state: "ready"; posts: PostStats[]; complete: boolean } | { state: "failed" };

/** Comment counts per post (last 7 days), read once per page view. */
export function useCommentStats(channelId: string): StatsState {
  const [s, setS] = useState<StatsState>({ state: "loading" });
  useEffect(() => {
    let live = true;
    fetch(`/api/channels/${channelId}/comment-stats`, { credentials: "same-origin" })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { posts?: PostStats[]; complete?: boolean };
        if (live) setS(res.ok && Array.isArray(body.posts) ? { state: "ready", posts: body.posts, complete: body.complete === true } : { state: "failed" });
      })
      .catch(() => live && setS({ state: "failed" }));
    return () => {
      live = false;
    };
  }, [channelId]);
  return s;
}

export const statsFor = (s: StatsState, postId: string) => (s.state === "ready" ? s.posts.find((p) => p.platformPostId === postId) : undefined);

/** "คอมเมนต์ 7 วัน: N" for the picker and rule rows. */
export function countLabel(s: StatsState, postId: string): string | null {
  const p = statsFor(s, postId);
  return p ? `คอมเมนต์ 7 วัน: ${p.comments7d}` : null;
}

/** A rule scoped to a post that had no comments in 7 days (UX audit P0-4). */
export function QuietPostWarning({ stats, postId, noun }: { stats: StatsState; postId: string; noun: string }) {
  const p = statsFor(stats, postId);
  if (!p || p.comments7d > 0) return null;
  return (
    <p role="note" className="m-0 mt-2 flex items-start gap-2 rounded-lg border border-[#f59e0b]/50 bg-[#f59e0b]/10 px-3 py-2 text-[14px]">
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-[#b45309] dark:text-[#fcd34d]" />
      <span>{noun}นี้ไม่มีคอมเมนต์ใน 7 วันที่ผ่านมา กฎนี้อาจไม่ได้ทำงาน ถ้าคนคอมเมนต์ใน{noun}อื่น ให้เปลี่ยนเป็น “ทุก{noun}” หรือเลือก{noun}ที่มีคนคอมเมนต์</span>
    </p>
  );
}

/**
 * "คอมเมนต์ที่ไม่ตรงกฎใน 7 วัน": posts whose recent comments matched no
 * active rule, each with "สร้างกฎให้{noun}นี้". Counts only.
 */
export function UnmatchedPanel({
  stats,
  posts,
  noun,
  onCreate,
}: {
  stats: StatsState;
  posts: PickerPost[];
  noun: string;
  onCreate: (postId: string) => void;
}) {
  if (stats.state === "loading") return <p className="m-0 text-[14px] text-muted-foreground">กำลังนับคอมเมนต์ 7 วันล่าสุด…</p>;
  if (stats.state === "failed") return <p className="m-0 text-[14px] text-muted-foreground">นับคอมเมนต์ไม่ได้ตอนนี้ ลองเปิดหน้านี้ใหม่ภายหลัง</p>;
  const rows = stats.posts.filter((p) => p.unmatched7d > 0).sort((a, b) => b.unmatched7d - a.unmatched7d);
  const total = rows.reduce((n, p) => n + p.unmatched7d, 0);
  if (rows.length === 0)
    return <p className="m-0 text-[14px] text-muted-foreground">ทุกคอมเมนต์ใน 7 วันล่าสุดตรงกับกฎ{stats.complete ? "" : " (อ่านได้บางโพสต์)"}</p>;
  return (
    <div className="grid min-w-0 gap-2">
      <p className="m-0 text-[15px]">
        คอมเมนต์ที่ไม่ตรงกฎใน 7 วัน: <strong>{total}</strong> รายการ ใน {rows.length} {noun}
        {stats.complete ? "" : " (อ่านได้บางโพสต์)"}
      </p>
      <ul className="m-0 grid min-w-0 list-none gap-2 p-0">
        {rows.slice(0, 5).map((r) => {
          const post = posts.find((p) => p.platformPostId === r.platformPostId);
          const label = post?.caption || `${noun} ID ${r.platformPostId}`;
          return (
            <li key={r.platformPostId} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-input px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block font-medium break-words">{label}</span>
                <span className="block text-[13px] text-muted-foreground">
                  ไม่ตรงกฎ {r.unmatched7d} จาก {r.comments7d} คอมเมนต์
                </span>
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => onCreate(r.platformPostId)} aria-label={`สร้างกฎให้${noun}นี้: ${label}`}>
                สร้างกฎให้{noun}นี้
              </Button>
            </li>
          );
        })}
      </ul>
      <p className="m-0 text-[13px] text-muted-foreground">นับเฉพาะคอมเมนต์จากคนอื่น (ไม่รวมการตอบกลับ) ระบบไม่เก็บข้อความหรือชื่อคนคอมเมนต์</p>
    </div>
  );
}
