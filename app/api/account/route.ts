export async function POST() {
  return Response.json(
    {
      code: "BACKEND_NOT_CONFIGURED",
      message:
        "ช่องทางสมัครหรืออนุมัติสมาชิกยังไม่เปิดให้ใช้ ไม่ได้สร้างสิทธิ์สมาชิกใด ๆ",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
