"use client";
import { useRef, useState } from "react";
import { send } from "@/lib/interactions/client";
import { finishPrivateUpload } from "@/lib/keys/youtube-upload";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";

export function YouTubePrivateUpload({ id, channel }: { id: string; channel: string }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [video, setVideo] = useState("");
  return <details className="yt-upload"><summary>อัปโหลดวิดีโอแบบ Private</summary>
    <form onSubmit={async event => {
      event.preventDefault();
      if (lock.current) return;
      const form = event.currentTarget;
      const data = new FormData(form);
      const file = data.get("clip");
      if (!(file instanceof File) || file.type !== "video/mp4" || !file.size || file.size > 100 * 1024 * 1024) {
        toast.error("เลือกไฟล์ MP4 ขนาดไม่เกิน 100 MB"); return;
      }
      lock.current = true; setBusy(true); setVideo("");
      const pending = toast.loading("กำลังอัปโหลด…");
      try {
        const result = await send<{ sessionUrl:string; channelId:string }>(`/api/keys/connections/${id}/youtube-upload`, "POST",
          { title: data.get("title"), size:file.size, madeForKids:data.get("kids") === "yes" });
        if (!result.ok) throw new Error(result.message);
        const videoId = await finishPrivateUpload(result.sessionUrl,file,result.channelId);
        form.reset(); setVideo(videoId);
        toast.update(pending, { type: "success", title: "YouTube รับคลิปแล้ว · Private", duration: 5000 });
      } catch(error) {
        toast.update(pending, { type: "error", title: error instanceof Error ? error.message : "ตรวจสอบผลใน YouTube Studio ก่อนลองใหม่", duration: 0 });
      } finally { lock.current = false; setBusy(false); }
    }}>
      <FieldSet disabled={busy} className="mt-3 gap-4">
        <FieldLegend variant="label">ช่อง {channel} · ผู้ชมเฉพาะฉัน</FieldLegend>
        <Field>
          <FieldLabel htmlFor={`${id}-clip`}>ไฟล์ MP4 (สูงสุด 100 MB)</FieldLabel>
          <Input id={`${id}-clip`} type="file" name="clip" accept="video/mp4" required className="h-auto py-1.5" />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-title`}>ชื่อวิดีโอ</FieldLabel>
          <Input id={`${id}-title`} name="title" maxLength={100} required />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-kids`}>วิดีโอนี้สร้างมาเพื่อเด็กหรือไม่</FieldLabel>
          <NativeSelect id={`${id}-kids`} name="kids" defaultValue="" required>
            <option value="" disabled>เลือกคำตอบ</option>
            <option value="yes">สร้างมาเพื่อเด็ก</option>
            <option value="no">ไม่ได้สร้างมาเพื่อเด็ก</option>
          </NativeSelect>
        </Field>
        <Button type="submit" className="w-fit">อัปโหลดไปยัง YouTube แบบ Private</Button>
      </FieldSet>
      <p>{video && <a href={ `https://studio.youtube.com/video/${video}/edit`} target="_blank" rel="noreferrer">ดูใน YouTube Studio</a>}</p>
    </form>
  </details>;
}
