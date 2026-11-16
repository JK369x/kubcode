import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PostComposer } from "@/components/PostComposer";
import { canonicalHostRedirect, readAuthConfig } from "@/lib/auth-policy";
import { getComposerView } from "@/lib/posts/view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "สร้างโพสต์ — kubcode", robots: { index: false, follow: false } };

export default async function NewPostPage() {
  const env = process.env;
  const view = await getComposerView(env, async () => {
    if (readAuthConfig(env).ok) {
      const to = canonicalHostRedirect(await headers());
      if (to) redirect(to);
    }
    return cookies();
  });
  if (view.state === "signed-out") redirect("/account");
  if (view.state === "disabled" || view.state === "forbidden") notFound();
  return (
    <main id="main" className="account-page">
      <div>
        <h1>สร้างโพสต์</h1>
        <p className="lead">อัปโหลดคลิปครั้งเดียว แล้วโพสต์หรือตั้งเวลาลงหลายช่องพร้อมกัน</p>
        {view.state === "ready" ? (
          <PostComposer channels={view.channels} />
        ) : (
          <p className="setup-notice" role="status">
            ระบบโพสต์ใช้งานไม่ได้ชั่วคราว ลองใหม่ภายหลัง
          </p>
        )}
        <p className="mt-6">
          <Link href="/account/posts">โพสต์ทั้งหมด</Link> · <Link href="/account/channels">ช่องที่เชื่อมไว้</Link>
        </p>
      </div>
    </main>
  );
}
