"use client";
import { useEffect, useState, useRef } from "react";
import { FileVideo, Upload, Send, UserRound } from "lucide-react";
import Display from "./display";
type Creator = {
  creator_nickname: string;
  privacy_level_options: string[];
  max_video_post_duration_sec: number;
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
};
async function api(action: string, data: unknown = {}) {
  const res = await fetch("/api/tiktok/" + action, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  const value = await res.json();
  if (!res.ok) throw Error(value.error || "sandbox_unavailable");
  return value;
}
export default function Composer({ failed }: { failed: boolean }) {
  const [creator, setCreator] = useState<Creator | null>(null),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      failed ? "เชื่อมบัญชีไม่สำเร็จ กรุณาเชื่อมใหม่" : "",
    ),
    [job, setJob] = useState("");
  const pending = useRef(false);
  useEffect(() => {
    api("creator")
      .then(setCreator)
      .catch((e) => {
        if (e.message !== "connect_required") setMessage(e.message);
      });
  }, []);
  useEffect(() => {
    setDuration(0);
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!job) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await api("status", { id: job });
        if (!active) return;
        if (
          result.status === "PUBLISH_COMPLETE" ||
          result.status === "FAILED"
        ) {
          setJob("");
          setMessage(
            result.status === "FAILED"
              ? "โพสต์ไม่สำเร็จ " + (result.reason ?? "")
              : "โพสต์ส่วนตัวสำเร็จ",
          );
          return;
        }
        setMessage("TikTok กำลังประมวลผลคลิป");
      } catch {
        if (!active) return;
        setMessage("กำลังตรวจสถานะอีกครั้ง");
      }
      timer = setTimeout(poll, 5000);
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [job]);
  async function connect(action: "start" | "display-connect") {
    setBusy(true);
    try {
      location.assign((await api(action)).url);
    } catch (error) {
      setMessage(String(error));
      setBusy(false);
    }
  }
  const status = <p role="status">{message}</p>;
  if (!creator)
    return (
      <>
        <section className="tt-panel tt-connect">
          <UserRound size={26} aria-hidden="true" />
          <h2>เชื่อมบัญชี TikTok</h2>
          <p id="profile-permissions">
            เลือกโพสต์อย่างเดียว หรืออนุญาตให้ kubcode แสดงโปรไฟล์ สถิติ
            และคลิปสาธารณะของคุณด้วย
          </p>
          <div className="tt-actions">
            <button
              className="tt-primary"
              disabled={busy}
              onClick={() => connect("start")}
            >
              เชื่อมเพื่อโพสต์อย่างเดียว
            </button>
            <button
              disabled={busy}
              aria-describedby="profile-permissions"
              onClick={() => connect("display-connect")}
            >
              เชื่อมพร้อมแสดงโปรไฟล์
            </button>
          </div>
        </section>
        {status}
      </>
    );
  return (
    <>
      <div className="tt-grid">
        <div className="tt-editor tt-panel">
          <header className="tt-editor-head">
            <h2>สร้างโพสต์</h2>
            <p>
              <UserRound size={16} aria-hidden="true" /> บัญชีปลายทาง{" "}
              <strong>{creator.creator_nickname}</strong>
            </p>
          </header>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!file || pending.current || job) return;
              const form = new FormData(e.currentTarget);
              pending.current = true;
              setBusy(true);
              try {
                setMessage("กำลังส่งคลิป");
                const { publish_id } = await api("init", {
                  size: file.size,
                  duration,
                  caption: form.get("caption"),
                  privacy: form.get("privacy"),
                  consent: form.has("consent"),
                  comment: form.has("comment"),
                  duet: form.has("duet"),
                  stitch: form.has("stitch"),
                  ownBrand: form.has("ownBrand"),
                  ai: form.has("ai"),
                });
                const res = await fetch("/api/tiktok/upload", {
                  method: "POST",
                  body: file,
                  headers: { "x-job": publish_id },
                });
                if (!res.ok) throw Error("ส่งไฟล์ไม่สำเร็จ");
                setJob(publish_id);
              } catch (err) {
                setMessage(String(err));
              } finally {
                setBusy(false);
                pending.current = false;
              }
            }}
          >
            <fieldset disabled={busy || !!job}>
              <legend className="tt-sr">รายละเอียดคลิป</legend>
              <p>
                <label className="tt-upload">
                  <FileVideo size={30} aria-hidden="true" />
                  <span>
                    <strong>{file ? file.name : "เลือกคลิปวิดีโอ"}</strong>
                    <small>MP4 · สูงสุด 64 MiB</small>
                  </span>
                  <Upload size={19} aria-hidden="true" />
                  <input
                    type="file"
                    accept="video/mp4,.mp4"
                    required
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </p>
              {preview && (
                <video
                  controls
                  src={preview}
                  style={{ maxWidth: "100%", maxHeight: 360 }}
                  onLoadedMetadata={(e) =>
                    setDuration(e.currentTarget.duration)
                  }
                />
              )}
              <p>
                <label>
                  แคปชั่น{" "}
                  <textarea
                    placeholder="เขียนแคปชั่นสำหรับคลิปนี้…"
                    rows={3}
                    name="caption"
                    maxLength={2200}
                  />
                </label>
              </p>
              <p>
                <label>
                  คนดู{" "}
                  <select name="privacy" required defaultValue="">
                    <option value="" disabled>
                      เลือกคนดู
                    </option>
                    {creator.privacy_level_options.includes("SELF_ONLY") && (
                      <option value="SELF_ONLY">เฉพาะฉัน</option>
                    )}
                  </select>
                </label>
              </p>
              <p className="tt-help">
                Sandbox ใช้บัญชีส่วนตัวและโพสต์แบบเฉพาะฉัน คลิปยาวได้ถึง{" "}
                {creator.max_video_post_duration_sec} วินาที
              </p>
              <h3>การโต้ตอบ</h3>
              <p className="tt-toggles">
                <label>
                  <input
                    type="checkbox"
                    name="comment"
                    disabled={creator.comment_disabled}
                  />{" "}
                  ความคิดเห็น
                </label>{" "}
                <label>
                  <input
                    type="checkbox"
                    name="duet"
                    disabled={creator.duet_disabled}
                  />{" "}
                  Duet
                </label>{" "}
                <label>
                  <input
                    type="checkbox"
                    name="stitch"
                    disabled={creator.stitch_disabled}
                  />{" "}
                  Stitch
                </label>
              </p>
              <p>
                <label>
                  <input type="checkbox" name="ai" /> คลิปสร้างด้วย AI
                </label>
              </p>
              <p>
                <label>
                  <input type="checkbox" name="ownBrand" /> โปรโมตแบรนด์ของฉัน
                  (Promotional content)
                </label>
              </p>
              <p className="tt-help">
                โพสต์ส่วนตัวใช้กับคลิปที่ไม่มีผู้สนับสนุนภายนอกเท่านั้น
              </p>
              <p>
                <label>
                  <input type="checkbox" name="consent" required />{" "}
                  ฉันยืนยันให้โพสต์คลิปนี้และยอมรับ{" "}
                  <a
                    href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
                    target="_blank"
                    rel="noreferrer"
                  >
                    ข้อกำหนดการใช้เพลงของ TikTok
                  </a>
                </label>
              </p>
              {file &&
                (file.size > 64 * 1024 * 1024 ||
                  duration > creator.max_video_post_duration_sec) && (
                  <p>คลิปเกินขนาดหรือความยาวที่รองรับ</p>
                )}
              <button
                className="tt-primary"
                disabled={
                  !file ||
                  file.size > 64 * 1024 * 1024 ||
                  !duration ||
                  duration > creator.max_video_post_duration_sec
                }
              >
                <Send size={16} aria-hidden="true" /> โพสต์บน TikTok
              </button>
            </fieldset>
          </form>
          {status}
        </div>
        <Display api={api} />
      </div>
    </>
  );
}
