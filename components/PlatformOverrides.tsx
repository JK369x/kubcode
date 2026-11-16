"use client";
import { PlatformLogo, type Platform } from "@/components/PlatformLogo";
import { PLATFORM_CAPTION_MAX, YOUTUBE_CATEGORIES, type TargetOptions } from "@/lib/posts/options";

export type Override = { captionOn: boolean; caption: string; options: TargetOptions };
export type OverrideChannel = { id: string; platform: string; displayName: string };

const NAME: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };

/** A switch-like checkbox row (native input, 44px target). */
function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 text-[15px]">
      <input id={id} type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--primary)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-[13px] text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

/**
 * Per-channel caption override and platform options (Zernio OpenAPI
 * 1.615.0: PlatformTarget.customContent, TikTok/Instagram/YouTube
 * PlatformData). Every option starts at today's default.
 */
export function PlatformOverrides({
  channels,
  sharedCaption,
  value,
  onChange,
}: {
  channels: OverrideChannel[];
  sharedCaption: string;
  value: Record<string, Override>;
  onChange: (id: string, next: Override) => void;
}) {
  if (channels.length === 0) return <p className="m-0 text-[14px] text-muted-foreground">เลือกช่องก่อน แล้วปรับแต่งแต่ละแพลตฟอร์มได้ที่นี่</p>;
  return (
    <div className="grid gap-4">
      {channels.map((c) => {
        const v = value[c.id] ?? { captionOn: false, caption: "", options: {} };
        const set = (patch: Partial<Override>) => onChange(c.id, { ...v, ...patch });
        const max = PLATFORM_CAPTION_MAX[c.platform] ?? 2200;
        const id = (k: string) => `ovr-${c.id}-${k}`;
        const tt = v.options.tiktok ?? {};
        const ig = v.options.instagram ?? {};
        const yt = v.options.youtube ?? {};
        return (
          <section key={c.id} aria-labelledby={id("h")} className="grid gap-3 rounded-xl border border-input p-4">
            <h3 id={id("h")} className="m-0 flex items-center gap-2 text-[16px] font-semibold">
              {(["youtube", "instagram", "tiktok"] as string[]).includes(c.platform) && <PlatformLogo platform={c.platform as Platform} size={20} decorative />}
              {c.displayName} <span className="font-normal text-muted-foreground">· {NAME[c.platform] ?? c.platform}</span>
            </h3>
            <Toggle
              id={id("cap")}
              label={`ใช้แคปชันแยกสำหรับ ${NAME[c.platform] ?? c.platform}`}
              checked={v.captionOn}
              onChange={(on) => set({ captionOn: on, caption: on && !v.caption ? sharedCaption : v.caption })}
            />
            {v.captionOn && (
              <div className="grid gap-1">
                <label htmlFor={id("text")} className="text-[14px]">
                  แคปชันสำหรับ {c.displayName}
                </label>
                <textarea
                  id={id("text")}
                  aria-describedby={id("count")}
                  className="min-h-24 rounded-md border border-input bg-card p-3 text-[16px] leading-[1.6]"
                  maxLength={max}
                  value={v.caption}
                  onChange={(e) => set({ caption: e.target.value })}
                />
                <span id={id("count")} className="text-right text-[13px] text-muted-foreground">
                  {[...v.caption].length}/{max} ตัวอักษร
                </span>
              </div>
            )}
            {c.platform === "tiktok" && (
              <div className="grid gap-1">
                <Toggle id={id("tc")} label="เปิดคอมเมนต์" hint="ปิดแล้วระบบตอบคอมเมนต์อัตโนมัติจะใช้กับโพสต์นี้ไม่ได้" checked={tt.allowComment ?? true} onChange={(x) => set({ options: { tiktok: { ...tt, allowComment: x } } })} />
                <Toggle id={id("td")} label="อนุญาต Duet" checked={tt.allowDuet ?? false} onChange={(x) => set({ options: { tiktok: { ...tt, allowDuet: x } } })} />
                <Toggle id={id("ts")} label="อนุญาต Stitch" checked={tt.allowStitch ?? false} onChange={(x) => set({ options: { tiktok: { ...tt, allowStitch: x } } })} />
                <Toggle
                  id={id("tdr")}
                  label="ส่งเป็นร่างไปที่แอป TikTok (ไม่โพสต์ทันที)"
                  hint="บัญชี TikTok for Business โพสต์ตรงได้แบบสาธารณะเท่านั้น ถ้าต้องการตั้งเป็นส่วนตัวหรือเฉพาะเพื่อน ให้ส่งเป็นร่าง แล้วเลือกความเป็นส่วนตัวและกดโพสต์เองในแอป"
                  checked={tt.draft ?? false}
                  onChange={(x) => set({ options: { tiktok: { ...tt, draft: x } } })}
                />
              </div>
            )}
            {c.platform === "instagram" && (
              <div className="grid gap-1">
                <Toggle id={id("if")} label="แสดง Reel บนหน้าโปรไฟล์ด้วย" hint="ปิด = แสดงเฉพาะแท็บ Reels" checked={ig.shareToFeed ?? true} onChange={(x) => set({ options: { instagram: { ...ig, shareToFeed: x } } })} />
                <Toggle id={id("ic")} label="เปิดคอมเมนต์" checked={ig.commentsEnabled ?? true} onChange={(x) => set({ options: { instagram: { ...ig, commentsEnabled: x } } })} />
                <Toggle id={id("ia")} label="ติดป้ายว่าใช้ AI สร้างภาพหรือวิดีโอ" checked={ig.aiGenerated ?? false} onChange={(x) => set({ options: { instagram: { ...ig, aiGenerated: x } } })} />
                <FirstComment id={id("ifc")} max={2200} value={ig.firstComment} onChange={(t) => set({ options: { instagram: { ...ig, firstComment: t } } })} />
              </div>
            )}
            {c.platform === "youtube" && (
              <div className="grid gap-1">
                <label htmlFor={id("yc")} className="grid gap-1 text-[15px]">
                  หมวดหมู่
                  <select id={id("yc")} className="h-11 w-fit rounded-md border border-input bg-card px-3" value={yt.categoryId ?? "22"} onChange={(e) => set({ options: { youtube: { ...yt, categoryId: e.target.value } } })}>
                    {YOUTUBE_CATEGORIES.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Toggle id={id("yk")} label="สร้างมาเพื่อเด็ก" hint="ตามกฎ COPPA ของ YouTube" checked={yt.madeForKids ?? false} onChange={(x) => set({ options: { youtube: { ...yt, madeForKids: x } } })} />
                <Toggle id={id("ys")} label="มีเนื้อหาที่สร้างหรือดัดแปลงด้วย AI ให้ดูเหมือนจริง" checked={yt.syntheticMedia ?? false} onChange={(x) => set({ options: { youtube: { ...yt, syntheticMedia: x } } })} />
                <Toggle id={id("yn")} label="แจ้งเตือนผู้ติดตาม" checked={yt.notifySubscribers ?? true} onChange={(x) => set({ options: { youtube: { ...yt, notifySubscribers: x } } })} />
                <FirstComment id={id("yfc")} max={10_000} value={yt.firstComment} onChange={(t) => set({ options: { youtube: { ...yt, firstComment: t } } })} />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function FirstComment({ id, max, value, onChange }: { id: string; max: number; value: string | undefined; onChange: (v: string | undefined) => void }) {
  return (
    <label htmlFor={id} className="grid gap-1 text-[15px]">
      คอมเมนต์แรก (ไม่บังคับ)
      <input id={id} className="h-11 rounded-md border border-input bg-card px-3" maxLength={max} value={value ?? ""} onChange={(e) => onChange(e.target.value.trim() ? e.target.value : undefined)} />
    </label>
  );
}
