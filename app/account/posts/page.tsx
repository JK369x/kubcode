import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { PostsList } from "@/components/PostsList";
import { Onboarding } from "@/components/Onboarding";
import { AccountShell, accountCaps } from "@/components/site/AccountShell";
import { Button } from "@/components/ui/button";
import { canonicalHostRedirect, readAuthConfig, signInPath } from "@/lib/auth-policy";
import { getPostsView } from "@/lib/posts/view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "โพสต์ของฉัน — kubcode", robots: { index: false, follow: false } };

export default async function PostsPage() {
  const env = process.env;
  const view = await getPostsView(env, async () => {
    if (readAuthConfig(env).ok) {
      const to = canonicalHostRedirect(await headers());
      if (to) redirect(to);
    }
    return cookies();
  });
  if (view.state === "signed-out") redirect(signInPath("/account/posts"));
  if (view.state === "disabled" || view.state === "forbidden") notFound();
  const caps = await accountCaps();
  return (
    <AccountShell caps={caps}
      section="posts"
      tone="social"
      eyebrow="kubcode Social"
      title="โพสต์ของฉัน"
      lead="โพสต์ที่ตั้งเวลาไว้และที่เผยแพร่แล้ว แยกตามช่อง (เวลาไทย)"
      actions={
        <Button asChild size="lg" className="rounded-full">
          <Link href="/account/posts/new">
            <Plus aria-hidden className="size-4" /> สร้างโพสต์
          </Link>
        </Button>
      }
    >
      <Onboarding compact />
      {view.state === "ready" ? (
        <PostsList posts={view.posts} />
      ) : (
        <p className="setup-notice" role="status">
          ระบบโพสต์ใช้งานไม่ได้ชั่วคราว ลองใหม่ภายหลัง
        </p>
      )}
      <p className="m-0 text-[15px] [&_a]:text-link [&_a]:underline [&_a]:underline-offset-(--link-offset)">
        <Link href="/account/channels">ช่องที่เชื่อมไว้</Link> · <Link href="/account">กลับไปหน้าพื้นที่สมาชิก</Link>
      </p>
    </AccountShell>
  );
}
