import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { canonicalHostRedirect, readAuthConfig } from "@/lib/auth-policy";
import { getWaitlistView } from "@/lib/waitlist/view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "คนที่รอแจ้งเตือน — kubcode",
  robots: { index: false, follow: false },
};

/** Owner only: how many members asked to be told when each plan / item opens. */
export default async function WaitlistPage() {
  const env = process.env;
  const view = await getWaitlistView(env, async () => {
    if (readAuthConfig(env).ok) {
      const redirectTo = canonicalHostRedirect(await headers());
      if (redirectTo) redirect(redirectTo);
    }
    return cookies();
  });
  if (view.state === "signed-out") redirect("/account");
  if (view.state === "disabled" || view.state === "forbidden") notFound();

  return (
    <main id="main" className="account-page">
      <div>
        <h1>คนที่รอแจ้งเตือน</h1>
        <p className="lead">จำนวนสมาชิกที่กด “แจ้งฉันเมื่อเปิด” ต่อแพ็กเกจและรายการในแผนที่จะมา (ยังไม่มีการส่งอีเมล)</p>
        {view.state === "ready" ? (
          <table className="mt-6 w-full border-collapse text-[15px]">
            <thead>
              <tr className="border-b border-input text-left">
                <th scope="col" className="py-2 pr-4 font-medium">รายการ</th>
                <th scope="col" className="py-2 pr-4 font-medium">ประเภท</th>
                <th scope="col" className="py-2 text-right font-medium">สมาชิก</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((r) => (
                <tr key={`${r.kind}:${r.id}`} className="border-b border-border">
                  <td className="py-2 pr-4 [overflow-wrap:anywhere]">{r.label}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{r.kind === "plan" ? "แพ็กเกจ" : "แผนที่จะมา"}</td>
                  <td className="py-2 text-right font-brand tabular-nums">{r.members}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="setup-notice" role="status">
            อ่านข้อมูลไม่ได้ชั่วคราว ลองใหม่ภายหลัง
          </p>
        )}
        <p className="mt-6">
          <Link href="/account">กลับไปหน้าพื้นที่สมาชิก</Link>
        </p>
      </div>
    </main>
  );
}
