"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ImageUp, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { PlatformLogo, type Platform } from "@/components/PlatformLogo";
import { send } from "@/lib/interactions/client";
import { bangkokLocalToIso, imageFacts, isoToBangkokLocal, putWithProgress, sha256Hex, videoFacts } from "@/lib/posts/media";

export type ComposerChannel = { id: string; platform: string; displayName: string; handle: string | null; usable: boolean; note: string | null };

type Uploaded = { assetId: string; name: string };
type Stage = { pct: number; label: string } | null;

const VIDEO_MAX = 500 * 1024 * 1024;
const COVER_MAX = 2 * 1024 * 1024;
const CAPTION_MAX = 2200;
const LEAD_MIN = 5;
const VISIBILITY: Record<string, { value: "public" | "unlisted" | "private"; label: string }[]> = {
  youtube: [
    { value: "public", label: "สาธารณะ" },
    { value: "unlisted", label: "ไม่แสดงในรายการ" },
    { value: "private", label: "ส่วนตัว" },
  ],
};
const isPlatform = (p: string): p is Platform => ["youtube", "instagram", "tiktok", "facebook"].includes(p);

function newClipRef() {
  return `web-${crypto.randomUUID()}`;
}

/**
 * The web composer: one video + cover, one caption for every platform,
 * several channels, now or a Bangkok date/time. Uploads go straight to S3
 * with a URL the publishing Lambda presigned for a key it chose.
 */
export function PostComposer({ channels }: { channels: ComposerChannel[] }) {
  const router = useRouter();
  const clipRef = useRef(newClipRef());
  const [video, setVideo] = useState<Uploaded | null>(null);
  const [cover, setCover] = useState<Uploaded | null>(null);
  const [stage, setStage] = useState<{ video: Stage; cover: Stage }>({ video: null, cover: null });
  const [caption, setCaption] = useState("");
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [visibility, setVisibility] = useState<Record<string, "public" | "unlisted" | "private">>({});
  const [when, setWhen] = useState<"now" | "later">("now");
  const [local, setLocal] = useState(() => isoToBangkokLocal(new Date(Date.now() + 60 * 60_000).toISOString()));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { delivered: number; failed: { name: string; codes: string[] }[] }>(null);

  const chosen = channels.filter((c) => c.usable && picked[c.id]);
  const needsTitle = chosen.some((c) => c.platform === "youtube");
  const minLocal = isoToBangkokLocal(new Date(Date.now() + LEAD_MIN * 60_000).toISOString());
  const ready = !!video && !!cover && chosen.length > 0 && caption.trim().length > 0 && !busy && !stage.video && !stage.cover;

  async function upload(kind: "video" | "cover", file: File) {
    const max = kind === "video" ? VIDEO_MAX : COVER_MAX;
    const types = kind === "video" ? ["video/mp4", "video/quicktime"] : ["image/png", "image/jpeg"];
    if (!types.includes(file.type)) return toast.error(kind === "video" ? "รองรับวิดีโอ MP4 หรือ MOV" : "รองรับภาพปก PNG หรือ JPG");
    if (file.size > max) return toast.error(kind === "video" ? "วิดีโอต้องไม่เกิน 500 MB" : "ภาพปกต้องไม่เกิน 2 MB");
    const set = (s: Stage) => setStage((p) => ({ ...p, [kind]: s }));
    try {
      set({ pct: 0, label: "กำลังตรวจไฟล์…" });
      const [sha, facts] = await Promise.all([sha256Hex(file), kind === "video" ? videoFacts(file) : imageFacts(file)]);
      const r = await send<{ assetId: string; upload: { url: string; headers: Record<string, string> } }>("/api/posts/upload", "POST", {
        kind,
        sha256: sha,
        contentType: file.type,
        bytes: file.size,
        width: facts.width,
        height: facts.height,
        ...("seconds" in facts ? { seconds: facts.seconds } : {}),
        clipRef: clipRef.current,
      });
      if (!r.ok) {
        set(null);
        return toast.error(r.message);
      }
      set({ pct: 0, label: "กำลังอัปโหลด…" });
      await putWithProgress(r.upload.url, r.upload.headers, file, (pct) => set({ pct, label: `กำลังอัปโหลด ${pct}%` }));
      set(null);
      (kind === "video" ? setVideo : setCover)({ assetId: r.assetId, name: file.name });
    } catch {
      set(null);
      toast.error("อัปโหลดไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่");
    }
  }

  async function submit() {
    if (!video || !cover) return;
    const publishAt = when === "now" ? null : bangkokLocalToIso(local);
    if (when === "later" && !publishAt) return toast.error("เลือกวันและเวลา");
    setBusy(true);
    const r = await send<{ already?: boolean; deliveries: { channelId: string; status: string; codes: string[] }[] }>("/api/posts", "POST", {
      clipRef: clipRef.current,
      videoAsset: video.assetId,
      coverAsset: cover.assetId,
      caption,
      ...(needsTitle && title.trim() ? { title: title.trim() } : {}),
      publishAt,
      targets: chosen.map((c) => ({ channelId: c.id, visibility: visibility[c.id] ?? "public" })),
    });
    setBusy(false);
    if (!r.ok) return toast.error(r.message);
    const name = (id: string) => channels.find((c) => c.id === id)?.displayName ?? "ช่อง";
    const failed = r.deliveries.filter((d) => d.status === "rejected" || d.status === "failed").map((d) => ({ name: name(d.channelId), codes: d.codes }));
    setDone({ delivered: r.already ? chosen.length : r.deliveries.length - failed.length, failed });
    router.refresh();
  }

  if (done) {
    return (
      <section aria-live="polite" className="grid gap-4 rounded-2xl border border-input bg-card p-5">
        <p className="m-0 flex items-center gap-2 text-[18px] font-semibold">
          <CheckCircle2 aria-hidden className="size-5 text-primary" /> ส่งโพสต์แล้ว {done.delivered} ช่อง
        </p>
        {done.failed.length > 0 && (
          <ul className="m-0 grid gap-1 pl-5 text-[15px]">
            {done.failed.map((f) => (
              <li key={f.name}>
                {f.name}: ไม่ผ่าน ({f.codes.join(", ")})
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <a href="/account/posts">ดูโพสต์ทั้งหมด</a>
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            สร้างโพสต์ใหม่
          </Button>
        </div>
      </section>
    );
  }

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <fieldset className="grid gap-3 rounded-2xl border border-input bg-card p-5">
        <legend className="px-1 text-[18px] font-semibold">1. ไฟล์</legend>
        <FilePick
          id="video"
          label="วิดีโอ (MP4 หรือ MOV ไม่เกิน 500 MB)"
          accept="video/mp4,video/quicktime"
          icon={<Upload aria-hidden className="size-5" />}
          stage={stage.video}
          done={video?.name ?? null}
          onPick={(f) => void upload("video", f)}
        />
        <FilePick
          id="cover"
          label="ภาพปก (PNG หรือ JPG ไม่เกิน 2 MB) จำเป็นสำหรับ YouTube, Instagram และ TikTok"
          accept="image/png,image/jpeg"
          icon={<ImageUp aria-hidden className="size-5" />}
          stage={stage.cover}
          done={cover?.name ?? null}
          onPick={(f) => void upload("cover", f)}
        />
      </fieldset>

      <fieldset className="grid gap-3 rounded-2xl border border-input bg-card p-5">
        <legend className="px-1 text-[18px] font-semibold">2. เลือกช่อง</legend>
        {channels.length === 0 ? (
          <p className="m-0 text-[15px]">
            ยังไม่มีช่องที่เชื่อมไว้ <a href="/account/channels">เชื่อมช่องก่อน</a>
          </p>
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
            {channels.map((c) => {
              const on = !!picked[c.id] && c.usable;
              return (
                <li key={c.id}>
                  <label
                    className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${on ? "border-primary bg-primary/5" : "border-input"} ${c.usable ? "" : "cursor-not-allowed opacity-60"}`}
                  >
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--primary)]"
                      checked={on}
                      disabled={!c.usable}
                      onChange={(e) => setPicked((p) => ({ ...p, [c.id]: e.target.checked }))}
                    />
                    {isPlatform(c.platform) ? <PlatformLogo platform={c.platform} size={24} decorative /> : null}
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.displayName}</span>
                      <span className="block text-[13px] text-muted-foreground">
                        {isPlatform(c.platform) ? { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" }[c.platform] : c.platform}
                        {c.handle ? ` · @${c.handle}` : ""}
                        {c.note ? ` · ${c.note}` : ""}
                      </span>
                    </span>
                  </label>
                  {on && VISIBILITY[c.platform] && (
                    <label className="mt-2 flex items-center gap-2 text-[14px]">
                      การมองเห็น
                      <select
                        className="h-9 rounded-md border border-input bg-card px-2"
                        value={visibility[c.id] ?? "public"}
                        onChange={(e) => setVisibility((v) => ({ ...v, [c.id]: e.target.value as "public" | "unlisted" | "private" }))}
                      >
                        {VISIBILITY[c.platform].map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <fieldset className="grid gap-3 rounded-2xl border border-input bg-card p-5">
        <legend className="px-1 text-[18px] font-semibold">3. แคปชัน</legend>
        <p className="m-0 text-[14px] text-muted-foreground">
          <Badge variant="secondary">แคปชันเดียวใช้ทุกแพลตฟอร์ม</Badge> (แยกต่อแพลตฟอร์มเร็ว ๆ นี้)
        </p>
        {needsTitle && (
          <label className="grid gap-1 text-[15px]">
            ชื่อคลิปบน YouTube (ไม่เกิน 100 ตัวอักษร ว่างไว้ = ใช้บรรทัดแรกของแคปชัน)
            <input className="h-11 rounded-md border border-input bg-card px-3" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
        )}
        <div className="grid gap-1 text-[15px]">
          <label htmlFor="caption">แคปชัน</label>
          <textarea
            id="caption"
            aria-describedby="caption-count"
            className="min-h-32 rounded-md border border-input bg-card p-3 text-[16px] leading-[1.6]"
            maxLength={CAPTION_MAX}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            required
          />
          <span id="caption-count" className="text-right text-[13px] text-muted-foreground">
            {caption.length}/{CAPTION_MAX} ตัวอักษร
          </span>
        </div>
      </fieldset>

      <fieldset className="grid gap-3 rounded-2xl border border-input bg-card p-5">
        <legend className="px-1 text-[18px] font-semibold">4. เวลาโพสต์</legend>
        <div className="flex flex-wrap gap-4 text-[15px]">
          <label className="flex min-h-11 items-center gap-2">
            <input type="radio" name="when" checked={when === "now"} onChange={() => setWhen("now")} className="size-5" />
            โพสต์ตอนนี้ (ภายใน ~5 นาที)
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="radio" name="when" checked={when === "later"} onChange={() => setWhen("later")} className="size-5" />
            ตั้งเวลา
          </label>
        </div>
        {when === "later" && (
          <label className="grid gap-1 text-[15px]">
            วันและเวลา (เวลาไทย)
            <input
              type="datetime-local"
              className="h-11 w-fit rounded-md border border-input bg-card px-3"
              min={minLocal}
              value={local}
              onChange={(e) => setLocal(e.target.value)}
            />
          </label>
        )}
      </fieldset>

      <div className="grid gap-2">
        <Button type="submit" disabled={!ready} className="w-full sm:w-auto">
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          {chosen.length === 0 ? "เลือกช่องก่อนโพสต์" : when === "now" ? `โพสต์ลง ${chosen.length} ช่อง` : `ตั้งเวลาโพสต์ลง ${chosen.length} ช่อง`}
        </Button>
        {!ready && !busy && (
          <p className="m-0 text-[13px] text-muted-foreground">ต้องมีวิดีโอ ภาพปก แคปชัน และเลือกอย่างน้อย 1 ช่อง</p>
        )}
      </div>
    </form>
  );
}

function FilePick({
  id,
  label,
  accept,
  icon,
  stage,
  done,
  onPick,
}: {
  id: string;
  label: string;
  accept: string;
  icon: React.ReactNode;
  stage: Stage;
  done: string | null;
  onPick: (f: File) => void;
}) {
  return (
    <div className="grid gap-2">
      <label htmlFor={`file-${id}`} className="text-[15px] font-medium">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-4 hover:border-primary focus-within:outline-2 focus-within:outline-offset-2"
          aria-disabled={!!stage}
        >
          {icon}
          {done ? "เปลี่ยนไฟล์" : "เลือกไฟล์"}
          <input
            id={`file-${id}`}
            type="file"
            accept={accept}
            className="sr-only"
            disabled={!!stage}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
              e.target.value = "";
            }}
          />
        </label>
        {done && !stage && (
          <span className="flex min-w-0 items-center gap-1 text-[14px]">
            <CheckCircle2 aria-hidden className="size-4 shrink-0 text-primary" />
            <span className="truncate">{done}</span>
          </span>
        )}
      </div>
      {stage && (
        <div className="grid gap-1" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={stage.pct} aria-valuemin={0} aria-valuemax={100} aria-label={stage.label}>
            <div className="h-full bg-primary transition-[width]" style={{ width: `${stage.pct}%` }} />
          </div>
          <span className="text-[13px] text-muted-foreground">{stage.label}</span>
        </div>
      )}
    </div>
  );
}
