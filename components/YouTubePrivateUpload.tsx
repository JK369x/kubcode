"use client";
import { useRef, useState } from "react";
import { send } from "@/lib/interactions/client";
import { finishPrivateUpload } from "@/lib/keys/youtube-upload";

export function YouTubePrivateUpload({ id, channel }: { id: string; channel: string }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [video, setVideo] = useState("");
  return <details><summary>อัปโหลดวิดีโอแบบ Private</summary>
    <form onSubmit={async event => {
      event.preventDefault();
      if (lock.current) return;
      const form = event.currentTarget;
      const data = new FormData(form);
      const file = data.get("clip");
      if (!(file instanceof File) || file.type !== "video/mp4" || !file.size || file.size > 100 * 1024 * 1024) {
        setMessage("เลือกไฟล์ MP4 ขนาดไม่เกิน 100 MB"); return;
      }
      lock.current = true; setBusy(true); setVideo(""); setMessage("กำลังอัปโหลด…");
      try {
        const result = await send<{ sessionUrl:string; channelId:string }>(`/api/keys/connections/${id}/youtube-upload`, "POST",
          { title: data.get("title"), size:file.size, madeForKids:data.get("kids") === "yes" });
        if (!result.ok) throw new Error(result.message);
        const videoId = await finishPrivateUpload(result.sessionUrl,file,result.channelId);
        form.reset(); setVideo(videoId); setMessage("YouTube รับคลิปแล้ว · Private");
      } catch(error) {
        setMessage(error instanceof Error ? error.message : "ตรวจสอบผลใน YouTube Studio ก่อนลองใหม่");
      } finally { lock.current = false; setBusy(false); }
    }}>
      <fieldset disabled={busy}><legend>ช่อง {channel} · ผู้ชมเฉพาะฉัน</legend>
        <p><label>ไฟล์ MP4 (สูงสุด 100 MB) <input type="file" name="clip" accept="video/mp4" required /></label></p>
        <p><label>ชื่อวิดีโอ <input name="title" maxLength={100} required /></label></p>
        <p><label>วิดีโอนี้สร้างมาเพื่อเด็กหรือไม่ <select name="kids" defaultValue="" required>
          <option value="" disabled>เลือกคำตอบ</option><option value="yes">สร้างมาเพื่อเด็ก</option><option value="no">ไม่ได้สร้างมาเพื่อเด็ก</option>
        </select></label></p>
        <button type="submit">อัปโหลดไปยัง YouTube แบบ Private</button>
      </fieldset>
      <p role="status">{message} {video && <a href={ `https://studio.youtube.com/video/${video}/edit`} target="_blank" rel="noreferrer">ดูใน YouTube Studio</a>}</p>
    </form>
  </details>;
}
