import { cookies } from "next/headers";
import Link from "next/link";
import { getSettingsView } from "@/lib/accounts/view";
import { notFound } from "next/navigation";
import Composer from "./composer";

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
    <main id="main" className="tt-studio">
      <header className="tt-heading">
        <h1>โพสต์คลิปบน TikTok</h1>
        <span>Sandbox · เฉพาะฉัน</span>
      </header>
      {member.state === "ready" ? (
        <Composer failed={Boolean((await searchParams).error)} />
      ) : (
        <Link href="/account">เข้าสู่ระบบสมาชิก</Link>
      )}
    </main>
  );
}
