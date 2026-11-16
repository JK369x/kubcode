import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { PostsList } from "@/components/PostsList";
import { Button } from "@/components/ui/button";
import { canonicalHostRedirect, readAuthConfig } from "@/lib/auth-policy";
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
  if (view.state === "signed-out") redirect("/account");
  if (view.state === "disabled" || view.state === "forbidden") notFound();
  return (
    <main id="main" className="account-page">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="m-0">โพสต์ของฉัน</h1>
          <Button asChild>
            <Link href="/account/posts/new">
              <Plus aria-hidden className="size-4" /> สร้างโพสต์
            </Link>
          </Button>
        </div>
        <p className="lead">โพสต์ที่ตั้งเวลาไว้และที่เผยแพร่แล้ว แยกตามช่อง (เวลาไทย)</p>
        {view.state === "ready" ? (
          <PostsList posts={view.posts} />
        ) : (
          <p className="setup-notice" role="status">
            ระบบโพสต์ใช้งานไม่ได้ชั่วคราว ลองใหม่ภายหลัง
          </p>
        )}
        <p className="mt-6">
          <Link href="/account/channels">ช่องที่เชื่อมไว้</Link> · <Link href="/account">กลับไปหน้าพื้นที่สมาชิก</Link>
        </p>
      </div>
    </main>
  );
}
