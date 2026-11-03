import { downloadEligibility } from "@/lib/access";
export async function GET() {
  const result = downloadEligibility({
    backendConfigured: false,
    session: false,
    member: "nonmember",
    rights: "uncleared",
    storageConfigured: false,
  });
  return Response.json(
    {
      ...result,
      message:
        "ยังไม่เชื่อมต่อ personal Supabase และ private storage ไม่มีไฟล์ดาวน์โหลดในต้นแบบนี้",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
