export async function finishPrivateUpload(sessionUrl: string, file: File, channelId: string, send: typeof fetch = fetch): Promise<string> {
  const url = new URL(sessionUrl);
  if (url.origin !== "https://www.googleapis.com" || url.pathname !== "/upload/youtube/v3/videos" || !url.searchParams.has("upload_id")) {
    throw new Error("ที่อยู่สำหรับอัปโหลดไม่ถูกต้อง");
  }
  const response = await send(url, {
    method: "PUT", body: file, headers: { "Content-Type": file.type },
    redirect: "error", credentials: "omit", referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw new Error("ยังยืนยันการอัปโหลดไม่ได้ ตรวจสอบช่องใน YouTube Studio ก่อนลองอีกครั้ง");
  const video = await response.json();
  if (video.snippet?.channelId !== channelId || video.status?.privacyStatus !== "private" || !/^[A-Za-z0-9_-]{11}$/.test(video.id ?? "")) {
    throw new Error("ยืนยันช่องหรือสถานะ Private ไม่ได้ ตรวจสอบใน YouTube Studio");
  }
  return video.id;
}
