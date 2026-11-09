import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ChannelsPanel } from "@/components/ChannelsPanel";
import styles from "@/components/KeysSettings.module.css";
import { canonicalHostRedirect, readAuthConfig } from "@/lib/auth-policy";
import { getChannelsView } from "@/lib/channels/view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ช่องที่เชื่อมไว้ — kubcode",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ChannelsPage({ searchParams }: Props) {
  const env = process.env;
  const view = await getChannelsView(env, async () => {
    if (readAuthConfig(env).ok) {
      const redirectTo = canonicalHostRedirect(await headers());
      if (redirectTo) redirect(redirectTo);
    }
    return cookies();
  });
  if (view.state === "signed-out") redirect("/account");
  // Off, or not allowed: the page does not exist for this visitor.
  if (view.state === "disabled" || view.state === "forbidden") notFound();
  const notice = (await searchParams).notice;

  return (
    <main id="main" className={`account-page ${styles.page}`}>
      <div>
        <h1>ช่องที่เชื่อมไว้</h1>
        {view.state === "ready" ? (
          <ChannelsPanel channels={view.channels} notice={typeof notice === "string" ? notice : null} />
        ) : (
          <p className="setup-notice" role="status">
            ระบบเชื่อมช่องใช้งานไม่ได้ชั่วคราว ลองใหม่ภายหลัง
          </p>
        )}
        <p className={styles.back}>
          <Link href="/account">กลับไปหน้าพื้นที่สมาชิก</Link>
        </p>
      </div>
    </main>
  );
}
