import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AutomationsPanel } from "@/components/AutomationsPanel";
import styles from "@/components/KeysSettings.module.css";
import { canonicalHostRedirect, readAuthConfig } from "@/lib/auth-policy";
import { getAutomationsView } from "@/lib/automations/view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ตอบคอมเมนต์อัตโนมัติ — kubcode",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ id: string }> };

export default async function AutomationsPage({ params }: Props) {
  const env = process.env;
  const { id } = await params;
  const view = await getAutomationsView(
    env,
    async () => {
      if (readAuthConfig(env).ok) {
        const redirectTo = canonicalHostRedirect(await headers());
        if (redirectTo) redirect(redirectTo);
      }
      return cookies();
    },
    id,
    new Date(),
  );
  if (view.state === "signed-out") redirect("/account");
  // Off, not allowed, or not this member's Instagram or TikTok channel: no such page.
  if (view.state === "disabled" || view.state === "forbidden" || view.state === "not-found") notFound();

  return (
    <main id="main" className={`account-page ${styles.page}`}>
      <div>
        <h1>ตอบคอมเมนต์อัตโนมัติ</h1>
        {view.state === "ready" ? (
          <AutomationsPanel channel={view.channel} rules={view.rules} usage={view.usage} recent={view.recent} />
        ) : (
          <p className="setup-notice" role="status">
            ระบบตอบคอมเมนต์อัตโนมัติใช้งานไม่ได้ชั่วคราว ลองใหม่ภายหลัง
          </p>
        )}
        <p className={styles.back}>
          <Link href="/account/channels">กลับไปหน้าช่องที่เชื่อมไว้</Link>
        </p>
      </div>
    </main>
  );
}
