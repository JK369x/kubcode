import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccountSettings } from "@/components/AccountSettings";
import { PublicNameForm } from "@/components/PublicNameForm";
import { settingsNotice } from "@/lib/accounts/notices";
import { canonicalHostRedirect, readAuthConfig } from "@/lib/auth-policy";
import { getSettingsView } from "@/lib/accounts/view";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AccountSettingsPage({ searchParams }: Props) {
  const env = process.env;
  const view = await getSettingsView(env, async () => {
    // Only reached when accounts are ON: pin the canonical host first.
    if (readAuthConfig(env).ok) {
      const redirectTo = canonicalHostRedirect(await headers());
      if (redirectTo) redirect(redirectTo);
    }
    return cookies();
  });
  // Signed out (or a revoked session): go to /account, never reveal account data.
  if (view.state === "signed-out") redirect("/account");
  const notice = settingsNotice(await searchParams);

  return (
    <main id="main" className="account-page">
      <div>
        <h1>ตั้งค่าการเข้าสู่ระบบ</h1>
        {view.state === "ready" ? (
          <AccountSettings view={view} notice={notice} />
        ) : (
          <p className="setup-notice" role="status">
            {view.state === "disabled"
              ? "บัญชีกลางและการเชื่อมวิธีเข้าสู่ระบบยังไม่เปิดใช้งานบนเซิร์ฟเวอร์นี้"
              : "ระบบบัญชีใช้งานไม่ได้ชั่วคราว ลองใหม่ภายหลัง"}
          </p>
        )}
        <p>
          <Link href="/account">กลับไปหน้าพื้นที่สมาชิก</Link>
        </p>
      </div>
      {view.state === "ready" && <PublicNameForm />}
      <section className="membership">
        <h2>การเชื่อมทำงานอย่างไร</h2>
        <dl>
          <dt>ไม่มีการรวมบัญชีจากอีเมล</dt>
          <dd>บัญชี Google และ LINE จะเชื่อมกันเมื่อคุณยืนยันเองครบทุกขั้นเท่านั้น อีเมลที่ตรงกันไม่ทำให้รวมบัญชี</dd>
          <dt>ยืนยันทั้งสองฝั่งใหม่ทุกครั้ง</dt>
          <dd>
            ต้องยืนยันบัญชีที่ใช้อยู่อีกครั้ง แล้วเข้าสู่ระบบด้วยบัญชีที่จะเชื่อม จากนั้นกดยืนยันขั้นสุดท้าย
            การยกเลิกการเชื่อมก็ต้องยืนยันตัวตนใหม่เช่นกัน
          </dd>
          <dt>สิทธิ์เท่ากันทุกวิธีที่เชื่อม</dt>
          <dd>ทุกวิธีที่เชื่อมไว้เข้าสู่บัญชีเดียวกัน หลังเชื่อมหรือยกเลิก ทุกอุปกรณ์ต้องเข้าสู่ระบบใหม่</dd>
          <dt>บัญชีที่เป็นของคนอื่นแล้ว</dt>
          <dd>เชื่อมไม่ได้ และระบบจะไม่ย้ายหรือรวมบัญชีนั้นให้</dd>
        </dl>
        <p>
          ระบบอนุมัติสมาชิกและการดาวน์โหลดยังไม่เปิด · <Link href="/privacy">นโยบายข้อมูล</Link>
        </p>
      </section>
    </main>
  );
}
