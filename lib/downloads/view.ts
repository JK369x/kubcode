// What a download button shows. Pure, so every state is testable without a browser.
export type DownloadPhase = "none" | "checking" | "closed" | "signin" | "ready" | "working";

export function downloadPhase(s: {
  hasPackage: boolean;
  /** undefined until the session has been read. */
  signedIn: boolean | undefined;
  /** undefined until the server has said whether downloads are on. */
  available: boolean | undefined;
  working: boolean;
}): DownloadPhase {
  if (!s.hasPackage) return "none";
  if (s.available === false) return "closed";
  if (s.signedIn === undefined || s.available === undefined) return "checking";
  if (!s.signedIn) return "signin";
  return s.working ? "working" : "ready";
}

export const PHASE_STATE: Record<DownloadPhase, string> = {
  none: "ยังไม่เปิดดาวน์โหลด",
  closed: "ยังไม่เปิดดาวน์โหลด",
  checking: "กำลังตรวจสอบ…",
  signin: "เข้าสู่ระบบก่อนดาวน์โหลด",
  ready: "สำหรับสมาชิก ฟรี",
  working: "กำลังเตรียมไฟล์…",
};
