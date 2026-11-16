import { cookies } from "next/headers";
import Link from "next/link";
import { getSettingsView } from "@/lib/accounts/view";
import { notFound } from "next/navigation";
import Composer from "./composer";
import { AccountShell } from "@/components/site/AccountShell";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!process.env.TIKTOK_SANDBOX_BRIDGE || !process.env.TIKTOK_SANDBOX_ORIGIN)
    notFound();
  const member = await getSettingsView(process.env, cookies);
  return (
    <AccountShell wide tone="social" eyebrow="Sandbox · เฉพาะฉัน" title="โพสต์คลิปบน TikTok">
      <div className="tt-studio">
        {member.state === "ready" ? (
          <Composer failed={Boolean((await searchParams).error)} />
        ) : (
          <Link href="/account">เข้าสู่ระบบสมาชิก</Link>
        )}
      </div>
    </AccountShell>
  );
}
