import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { KeysSettings } from "@/components/KeysSettings";
import styles from "@/components/KeysSettings.module.css";
import { canonicalHostRedirect, readAuthConfig } from "@/lib/auth-policy";
import { getKeysView } from "@/lib/keys/view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ตั้งค่าคีย์และบัญชีโพสต์ — kubcode",
  robots: { index: false, follow: false },
};

export default async function KeysPage() {
  const env = process.env;
  const view = await getKeysView(env, async () => {
    if (readAuthConfig(env).ok) {
      const redirectTo = canonicalHostRedirect(await headers());
      if (redirectTo) redirect(redirectTo);
    }
    return cookies();
  });
  if (view.state === "signed-out") redirect("/account");
  // Off, or not allowed: the page does not exist for this visitor.
  if (view.state === "disabled" || view.state === "forbidden") notFound();

  return (
    <main id="main" className={`account-page ${styles.page}`}>
      <div>
        <h1>ตั้งค่าคีย์และบัญชีโพสต์</h1>
        {view.state === "ready" ? (
          <KeysSettings overview={view.overview} canSave={view.canSave} />
        ) : (
          <p className="setup-notice" role="status">
            ระบบคีย์ใช้งานไม่ได้ชั่วคราว ลองใหม่ภายหลัง
          </p>
        )}
        <p className={styles.back}>
          <Link href="/account">กลับไปหน้าพื้นที่สมาชิก</Link>
        </p>
      </div>
    </main>
  );
}
