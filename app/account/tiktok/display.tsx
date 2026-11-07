"use client";
import { useEffect, useState } from "react";
type Summary = {
  profile: {
    display_name?: string;
    username?: string;
    bio_description?: string;
    follower_count?: number;
    following_count?: number;
    likes_count?: number;
    video_count?: number;
  } | null;
  videos:
    | { id: string; title: string; share_url: string; view_count: number }[]
    | null;
  scopes: string[];
};
export default function Display({
  api,
}: {
  api: (action: string) => Promise<any>;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api("display")
      .then((data) => {
        if (active) setSummary(data);
      })
      .catch(() => {
        if (active) setError("โหลดข้อมูล TikTok ไม่สำเร็จ");
      });
    return () => {
      active = false;
    };
  }, [api]);
  const user = summary?.profile;
  return (
    <section className="tt-profile tt-panel" aria-label="โปรไฟล์ TikTok">
      <h3>โปรไฟล์ TikTok</h3>
      {user?.display_name && <h2>{user.display_name}</h2>}
      {user?.username && <p>@{user.username}</p>}
      {user?.bio_description && <p>{user.bio_description}</p>}
      {user?.follower_count !== undefined && (
        <dl>
          {[
            ["ผู้ติดตาม", user.follower_count],
            ["กำลังติดตาม", user.following_count],
            ["ถูกใจ", user.likes_count],
            ["วิดีโอ", user.video_count],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value?.toLocaleString("th-TH")}</dd>
            </div>
          ))}
        </dl>
      )}
      {summary?.videos && (
        <>
          <h3>คลิปสาธารณะล่าสุด</h3>
          {summary.videos.length ? (
            <ul>
              {summary.videos.map((v) => (
                <li key={v.id}>
                  <a href={v.share_url} rel="noreferrer" target="_blank">
                    {v.title || "ดูคลิปบน TikTok"}
                  </a>
                  <small>{v.view_count.toLocaleString("th-TH")} ครั้ง</small>
                </li>
              ))}
            </ul>
          ) : (
            <p>ยังไม่มีคลิปสาธารณะที่แสดงได้</p>
          )}
        </>
      )}
      {summary &&
        [
          "user.info.basic",
          "user.info.profile",
          "user.info.stats",
          "video.list",
        ].some((s) => !summary.scopes.includes(s)) && (
          <button
            onClick={async () => {
              try {
                location.assign((await api("display-connect")).url);
              } catch {
                setError("เชื่อมสิทธิ์ไม่สำเร็จ");
              }
            }}
          >
            เชื่อมโปรไฟล์ สถิติ และคลิปสาธารณะ
          </button>
        )}
      {error && <p role="status">{error}</p>}
    </section>
  );
}
