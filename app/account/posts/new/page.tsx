import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PostComposer } from "@/components/PostComposer";
import { canonicalHostRedirect, readAuthConfig, signInPath } from "@/lib/auth-policy";
import { AccountShell, accountCaps } from "@/components/site/AccountShell";
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
  if (view.state === "signed-out") redirect(signInPath("/account/posts/new"));
  if (view.state === "disabled" || view.state === "forbidden") notFound();
  const caps = await accountCaps();
  return (
    <AccountShell caps={caps}
      section="posts"
      wide
      tone="social"
      eyebrow="kubcode Social"
      title="สร้างโพสต์"
      accent="อัปโหลดครั้งเดียว ลงได้หลายช่อง"
      lead="อัปโหลดคลิปครั้งเดียว แล้วโพสต์หรือตั้งเวลาลงหลายช่องพร้อมกัน"
    >
      {view.state === "ready" ? (
        <PostComposer channels={view.channels} />
      ) : (
        <p className="setup-notice" role="status">
          ระบบโพสต์ใช้งานไม่ได้ชั่วคราว ลองใหม่ภายหลัง
        </p>
      )}
      <p className="m-0 text-[15px] [&_a]:text-link [&_a]:underline [&_a]:underline-offset-(--link-offset)">
        <Link href="/account/posts">โพสต์ทั้งหมด</Link> · <Link href="/account/channels">ช่องที่เชื่อมไว้</Link>
      </p>
    </AccountShell>
  );
}
