// Pure shared policy: callable by Server Components, unlike client exports.
import { ACCOUNT_ERRORS, isAccountErrorCode } from "./errors";

// Fixed Thai text for the callback landing query. Unknown codes are generic.
export function settingsNotice(params: Record<string, string | string[] | undefined>): string | null {
  if (params.link === "source_verified") return "ยืนยันบัญชีเดิมแล้ว ทำขั้นถัดไปต่อได้เลย";
  if (params.link === "target_verified")
    return "ยืนยันบัญชีที่จะเชื่อมแล้ว ตรวจสอบชื่อบัญชีแล้วกดยืนยันการเชื่อม";
  const code = params.link_error;
  if (code === undefined) return null;
  return isAccountErrorCode(code) ? ACCOUNT_ERRORS[code].message : ACCOUNT_ERRORS.LINK_INVALID.message;
}

