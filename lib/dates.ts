/** "3 พฤศจิกายน 2569" for an ISO date (YYYY-MM-DD), stable across time zones. */
export function thaiDate(iso: string, month: "long" | "short" = "long"): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month, year: "numeric", timeZone: "UTC" });
}
