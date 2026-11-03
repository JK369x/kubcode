// Stable error contract for account routes and link callbacks: fixed code,
// HTTP status and Thai message. Raw errors, SQL text or identities never leak.

export const ACCOUNT_ERRORS = Object.freeze({
  ACCOUNTS_DISABLED: { status: 503, message: "ระบบบัญชีกลางยังไม่เปิดใช้งานบนเซิร์ฟเวอร์นี้" },
  ACCOUNTS_UNAVAILABLE: { status: 503, message: "ระบบบัญชีใช้งานไม่ได้ชั่วคราว ลองใหม่ภายหลัง" },
  BAD_ORIGIN: { status: 403, message: "คำขอนี้ไม่ได้มาจากหน้าเว็บ kubcode.dev จึงถูกปฏิเสธ" },
  CSRF_INVALID: { status: 403, message: "ข้อมูลยืนยันคำขอหมดอายุหรือไม่ถูกต้อง โหลดหน้าใหม่แล้วลองอีกครั้ง" },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: "รูปแบบคำขอไม่ถูกต้อง" },
  PAYLOAD_TOO_LARGE: { status: 413, message: "คำขอมีขนาดใหญ่เกินไป" },
  BAD_REQUEST: { status: 400, message: "ข้อมูลคำขอไม่ถูกต้อง" },
  NOT_SIGNED_IN: { status: 401, message: "กรุณาเข้าสู่ระบบก่อน" },
  PROVIDER_UNAVAILABLE: { status: 409, message: "วิธีเข้าสู่ระบบนี้ยังไม่เปิดใช้งานบนเซิร์ฟเวอร์นี้" },
  ALREADY_LINKED: { status: 409, message: "บัญชีของคุณเชื่อมวิธีเข้าสู่ระบบนี้ไว้แล้ว" },
  NOT_LINKED: { status: 409, message: "บัญชีของคุณไม่ได้เชื่อมวิธีเข้าสู่ระบบนี้" },
  LAST_LOGIN_METHOD: {
    status: 409,
    message: "ยกเลิกการเชื่อมไม่ได้ เพราะจะไม่เหลือวิธีเข้าสู่ระบบที่ใช้งานได้บนเซิร์ฟเวอร์นี้",
  },
  LINK_INVALID: { status: 409, message: "คำขอนี้ใช้ต่อไม่ได้แล้ว เริ่มใหม่จากหน้าตั้งค่าบัญชี" },
  LINK_EXPIRED: { status: 410, message: "คำขอหมดเวลาแล้ว เริ่มใหม่จากหน้าตั้งค่าบัญชี" },
  LINK_WRONG_ACCOUNT: {
    status: 409,
    message: "บัญชีที่ยืนยันไม่ตรงกับขั้นตอนนี้ คำขอถูกยกเลิก เริ่มใหม่อีกครั้ง",
  },
  LINK_CONFLICT: { status: 409, message: "เชื่อมบัญชีนี้ไม่ได้ ลองใช้บัญชีอื่น" },
} as const);

export type AccountErrorCode = keyof typeof ACCOUNT_ERRORS;

export function isAccountErrorCode(value: unknown): value is AccountErrorCode {
  return typeof value === "string" && Object.hasOwn(ACCOUNT_ERRORS, value);
}

export function accountErrorMessage(code: unknown): string | null {
  return isAccountErrorCode(code) ? ACCOUNT_ERRORS[code].message : null;
}

export function accountErrorResponse(code: AccountErrorCode, setCookies: string[] = []): Response {
  const safe: AccountErrorCode = isAccountErrorCode(code) ? code : "ACCOUNTS_UNAVAILABLE";
  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const cookie of setCookies) headers.append("Set-Cookie", cookie);
  return Response.json(
    { code: safe, message: ACCOUNT_ERRORS[safe].message },
    { status: ACCOUNT_ERRORS[safe].status, headers },
  );
}
