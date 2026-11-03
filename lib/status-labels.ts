const LABELS = new Map([
  ["selected", "เลือกแนวภาพแล้ว"],
  ["draft", "ฉบับทดลอง"],
  ["experimental", "ฉบับทดลอง"],
  ["shared", "เวิร์กโฟลว์ร่วม"],
  ["local", "เวิร์กโฟลว์ในเครื่อง"],
]);

/** Shared presentation only: never changes the source enum or implies readiness. */
export function statusLabel(status: string): string {
  return LABELS.get(status) ?? "รอตรวจ";
}
