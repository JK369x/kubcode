// Thai relative time for the community feed ("5 นาทีที่ผ่านมา", "เมื่อวาน").
const rtf = new Intl.RelativeTimeFormat("th", { numeric: "auto" });
const STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "5 นาทีที่ผ่านมา", "เมื่อวาน"; under a minute reads as "เมื่อสักครู่". */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const secs = Math.round((new Date(iso).getTime() - now) / 1000);
  for (const [unit, size] of STEPS) if (Math.abs(secs) >= size) return rtf.format(Math.trunc(secs / size), unit);
  return "เมื่อสักครู่";
}
