import type { Metadata } from "next";
import Link from "next/link";
import { AccountShell } from "@/components/site/AccountShell";
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
    <AccountShell
      eyebrow="เจ้าของเว็บ"
      title="คนที่รอแจ้งเตือน"
      lead="จำนวนสมาชิกที่กด “แจ้งฉันเมื่อเปิด” ต่อแพ็กเกจและรายการในแผนที่จะมา (ยังไม่มีการส่งอีเมล)"
    >
      {view.state === "ready" ? (
        <div className="overflow-x-auto rounded-[22px] border border-input bg-card/90">
          <table className="w-full border-collapse text-[15px]">
            <thead>
              <tr className="border-b border-input text-left">
                <th scope="col" className="px-5 py-3 font-semibold">รายการ</th>
                <th scope="col" className="px-5 py-3 font-semibold">ประเภท</th>
                <th scope="col" className="px-5 py-3 text-right font-semibold">สมาชิก</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((r) => (
                <tr key={`${r.kind}:${r.id}`} className="border-b border-border last:border-b-0">
                  <td className="px-5 py-3 [overflow-wrap:anywhere]">{r.label}</td>
                  <td className="px-5 py-3 text-muted-foreground">{r.kind === "plan" ? "แพ็กเกจ" : "แผนที่จะมา"}</td>
                  <td className="px-5 py-3 text-right font-brand tabular-nums">{r.members}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="setup-notice" role="status">
          อ่านข้อมูลไม่ได้ชั่วคราว ลองใหม่ภายหลัง
        </p>
      )}
      <p className="m-0 text-[15px] [&_a]:text-link [&_a]:underline [&_a]:underline-offset-(--link-offset)">
        <Link href="/account">กลับไปหน้าพื้นที่สมาชิก</Link>
      </p>
    </AccountShell>
  );
}
