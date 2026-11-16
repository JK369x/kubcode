// Thai messages for the composer routes (fixed codes only).
import { ACCOUNT_ERRORS } from "../accounts/errors";

export type PostErrorCode =
  | "UNAVAILABLE"
  | "BAD_REQUEST"
  | "UPLOAD_TYPE"
  | "UPLOAD_TOO_LARGE"
  | "UPLOAD_QUOTA"
  | "ASSET_NOT_FOUND"
  | "TOO_SOON"
  | "TOO_FAR"
  | "SCHEDULE_FAILED"
  | "DELIVERY_NOT_FOUND"
  | "ALREADY_FINAL";

export const CHANNEL_ERRORS: Record<PostErrorCode, { status: number; message: string }> = {
  UNAVAILABLE: { status: 503, message: "ระบบโพสต์ใช้งานไม่ได้ชั่วคราว ลองใหม่ภายหลัง" },
  BAD_REQUEST: ACCOUNT_ERRORS.BAD_REQUEST,
  UPLOAD_TYPE: { status: 422, message: "รองรับวิดีโอ MP4 หรือ MOV และภาพปก PNG หรือ JPG" },
  UPLOAD_TOO_LARGE: { status: 422, message: "ไฟล์ใหญ่เกินไป (วิดีโอไม่เกิน 500 MB ภาพปกไม่เกิน 2 MB)" },
  UPLOAD_QUOTA: { status: 429, message: "วันนี้อัปโหลดครบโควตาแล้ว (40 ไฟล์หรือ 5 GB ต่อวัน) ลองใหม่พรุ่งนี้" },
  ASSET_NOT_FOUND: { status: 409, message: "ไม่พบไฟล์ที่อัปโหลด อัปโหลดใหม่อีกครั้ง" },
  TOO_SOON: { status: 422, message: "เลือกเวลาอย่างน้อย 5 นาทีจากตอนนี้" },
  TOO_FAR: { status: 422, message: "ตั้งเวลาล่วงหน้าได้ไม่เกิน 30 วัน" },
  SCHEDULE_FAILED: { status: 409, message: "ตั้งเวลาโพสต์ไม่สำเร็จ ลองใหม่อีกครั้ง" },
  DELIVERY_NOT_FOUND: { status: 404, message: "ไม่พบโพสต์นี้" },
  ALREADY_FINAL: { status: 409, message: "โพสต์นี้เผยแพร่หรือยกเลิกไปแล้ว" },
};

export const postError = (code: PostErrorCode) =>
  Response.json({ code, message: CHANNEL_ERRORS[code].message }, { status: CHANNEL_ERRORS[code].status, headers: { "Cache-Control": "no-store" } });
