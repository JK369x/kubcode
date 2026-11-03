import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccountForm } from "@/components/AccountForm";
import { getAccountView } from "@/lib/auth";
import { authErrorMessage, canonicalHostRedirect, readAuthConfig } from "@/lib/auth-policy";
import { accountsEnabled } from "@/lib/accounts/view";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Account({ searchParams }: Props) {
  if (readAuthConfig(process.env).ok) {
    const redirectTo = canonicalHostRedirect(await headers());
    if (redirectTo) redirect(redirectTo);
  }
  const view = await getAccountView();
  const { error, account_notice: accountNotice } = await searchParams;
  // Central accounts are ON with a usable configuration (DB truth is checked per request).
  const settingsAvailable = accountsEnabled();
  const formProps =
    view.state === "signed-out"
      ? {
          ...view,
          errorMessage:
            authErrorMessage(error) ??
            (accountNotice === "linked"
              ? "เชื่อมวิธีเข้าสู่ระบบแล้ว ทุกอุปกรณ์ออกจากระบบแล้ว กรุณาเข้าสู่ระบบใหม่"
              : accountNotice === "unlinked"
                ? "ยกเลิกการเชื่อมแล้ว ทุกอุปกรณ์ออกจากระบบแล้ว กรุณาเข้าสู่ระบบใหม่"
                : null),
        }
      : view.state === "signed-in"
        ? { ...view, settingsAvailable }
        : view;

  return (
    <main id="main" className="account-page">
      <div>
        <h1>พื้นที่สมาชิก</h1>
        <p className="lead">
          เข้าสู่ระบบด้วย Google หรือ LINE เพื่อยืนยันตัวตน
          <br />
          การเข้าสู่ระบบไม่เท่ากับการเป็นสมาชิกหรือสิทธิ์ดาวน์โหลด
        </p>
        <p className="setup-notice">
          {settingsAvailable
            ? "บัญชีกลางบันทึกเฉพาะวิธีเข้าสู่ระบบที่เชื่อมไว้ ระบบอนุมัติสมาชิกยังไม่พร้อม"
            : "ระบบอนุมัติสมาชิกยังไม่พร้อม ยังไม่มีการบันทึกบัญชีสมาชิกในฐานข้อมูล"}
          <br />
          ดาวน์โหลดยังปิดอยู่สำหรับทุกคน
        </p>
        <AccountForm {...formProps} />
      </div>
      <section className="membership">
        <h2>สถานะที่ต้องแยกกัน</h2>
        <dl>
          <dt>ยังไม่เข้าสู่ระบบ</dt>
          <dd>อ่านคลังและบทความได้ แต่ยังดาวน์โหลดไม่ได้</dd>
          <dt>เข้าสู่ระบบด้วย Google หรือ LINE แล้ว</dt>
          <dd>
            ยืนยันได้แค่ว่าเป็นเจ้าของบัญชีนั้น (Google ยืนยันอีเมล ส่วน LINE ไม่ได้ให้อีเมล)
            ไม่ใช่สมาชิกที่ได้รับอนุมัติ และยังไม่ถูกเพิ่มเข้าคิวรออนุมัติใด ๆ
            {settingsAvailable
              ? "บัญชี Google และ LINE ไม่ถูกรวมให้อัตโนมัติ เชื่อมได้เองที่หน้าตั้งค่าการเข้าสู่ระบบหลังยืนยันทั้งสองฝั่ง"
              : "บัญชี Google และ LINE ถือเป็นคนละบัญชี ระบบไม่รวมบัญชีให้"}
          </dd>
          <dt>สมาชิกที่ได้รับอนุมัติ</dt>
          <dd>ยังไม่เปิด — ต้องมีระบบอนุมัติและไฟล์ที่เคลียร์สิทธิ์ก่อน</dd>
        </dl>
        <p>
          สิทธิ์ผู้ดูแลแยกจากสมาชิก ไม่มีสวิตช์อนุมัติในเบราว์เซอร์ ·{" "}
          <Link href="/privacy">นโยบายข้อมูล</Link>
        </p>
      </section>
    </main>
  );
}
