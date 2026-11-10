"use client";
import Link from "next/link";
import { MessageCircle, Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { PageKind } from "@/lib/interactions/store";
import { relativeTime } from "@/lib/relative-time";
import { fetchStarCounts } from "./StarCounts";
import styles from "./Community.module.css";

/** One feed entry as /api/interactions/latest returns it (public fields only). */
export type FeedItem = {
  id: string;
  kind: PageKind;
  slug: string;
  title: string;
  href: string;
  author: string;
  body: string;
  isReply: boolean;
  createdAt: string;
};

type FeedState =
  | { state: "loading" }
  | { state: "closed"; message: string }
  | { state: "ready"; items: FeedItem[]; nextCursor: string | null };

const KIND_LABEL: Record<PageKind, string> = { article: "บทความ", tool: "เครื่องมือ", skill: "skill" };

type Loaded = { ok: true; items: FeedItem[]; nextCursor: string | null } | { ok: false; message: string };
const LOAD_FAILED = "โหลดความเคลื่อนไหวไม่สำเร็จ ลองใหม่ภายหลัง";

async function loadFeed(limit: number, before: string | null): Promise<Loaded> {
  const qs = `limit=${limit}${before ? `&before=${before}` : ""}`;
  const res = await fetch(`/api/interactions/latest?${qs}`, { credentials: "omit", cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { available?: boolean; comments?: FeedItem[]; nextCursor?: string | null };
  if (body.available === false) return { ok: false, message: "ดาวและคอมเมนต์ยังไม่เปิดใช้งานบนเซิร์ฟเวอร์นี้" };
  if (!res.ok || !Array.isArray(body.comments)) return { ok: false, message: LOAD_FAILED };
  return { ok: true, items: body.comments, nextCursor: body.nextCursor ?? null };
}

function useFeed(limit: number) {
  const [feed, setFeed] = useState<FeedState>({ state: "loading" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void loadFeed(limit, null)
      .catch((): Loaded => ({ ok: false, message: LOAD_FAILED }))
      .then((r) => {
        if (!live) return;
        setFeed(r.ok ? { state: "ready", items: r.items, nextCursor: r.nextCursor } : { state: "closed", message: r.message });
      });
    return () => {
      live = false;
    };
  }, [limit]);
  const more = useCallback(async () => {
    if (feed.state !== "ready" || !feed.nextCursor) return;
    setBusy(true);
    try {
      const r = await loadFeed(limit, feed.nextCursor);
      if (r.ok) setFeed({ state: "ready", items: [...feed.items, ...r.items], nextCursor: r.nextCursor });
    } catch {
      // Keep what is shown; the button stays for another try.
    } finally {
      setBusy(false);
    }
  }, [feed, limit]);
  return { feed, busy, more };
}

function FeedList({ items }: { items: FeedItem[] }) {
  return (
    <ol className={styles.feed}>
      {items.map((c) => (
        <li key={c.id} className={styles.item}>
          <p className={styles.itemHead}>
            <strong>{c.author}</strong>
            {c.isReply ? " ตอบกลับใน " : " คอมเมนต์ใน "}
            <Link href={`${c.href}`}>{c.title}</Link>
            <span className={styles.kind}>{KIND_LABEL[c.kind]}</span>
          </p>
          <p className={styles.body}>{c.body}</p>
          <p className={styles.meta}>
            <time dateTime={c.createdAt} title={new Date(c.createdAt).toLocaleString("th-TH")}>
              {relativeTime(c.createdAt)}
            </time>
          </p>
        </li>
      ))}
    </ol>
  );
}

function EmptyFeed() {
  return (
    <div className={styles.empty}>
      <p>
        <strong>ยังไม่มีใครเริ่มคุย</strong> อ่านบทความหรือเครื่องมือที่สนใจ แล้วเล่าประสบการณ์ ถามคำถาม หรือแชร์ทริกเป็นคนแรกได้เลย
      </p>
      <p className={styles.meta}>อ่านได้ทุกคน คอมเมนต์และให้ดาวต้องเข้าสู่ระบบด้วย Google หรือ LINE</p>
    </div>
  );
}

/** "ความเคลื่อนไหวล่าสุด": the 5 newest comments, under the /articles grid. */
export function LatestComments() {
  const { feed } = useFeed(5);
  // Off or failing: the block disappears instead of taking space.
  if (feed.state !== "ready") return null;
  return (
    <section className={styles.block} aria-labelledby="latest-comments">
      <div className={styles.blockHead}>
        <h2 id="latest-comments">
          <MessageCircle size={20} aria-hidden /> ความเคลื่อนไหวล่าสุด
        </h2>
        <Link href="/community" className={styles.all}>
          ดูทั้งหมดในชุมชน
        </Link>
      </div>
      {feed.items.length === 0 ? <EmptyFeed /> : <FeedList items={feed.items} />}
    </section>
  );
}

/** /community: the latest 30, then older pages by cursor. */
export function CommunityFeed() {
  const { feed, busy, more } = useFeed(30);
  return (
    <section className={styles.block} aria-labelledby="community-feed" aria-busy={feed.state === "loading"}>
      <div className={styles.blockHead}>
        <h2 id="community-feed">
          <MessageCircle size={20} aria-hidden /> ความเคลื่อนไหวล่าสุด
        </h2>
      </div>
      {feed.state === "closed" && <p className={styles.meta}>{feed.message}</p>}
      {feed.state === "ready" && (feed.items.length === 0 ? <EmptyFeed /> : <FeedList items={feed.items} />)}
      {feed.state === "ready" && feed.nextCursor && (
        <button type="button" className={styles.more} onClick={() => void more()} disabled={busy}>
          แสดงคอมเมนต์ก่อนหน้า
        </button>
      )}
    </section>
  );
}

export type PopularPage = { kind: PageKind; slug: string; title: string; href: string };

const TOP_N = 5;

/** "ยอดนิยม": the most-starred pages per kind; pages without stars are left out. */
export function PopularLists({ groups }: { groups: Array<{ kind: PageKind; label: string; pages: PopularPage[] }> }) {
  const [counts, setCounts] = useState<Partial<Record<PageKind, Record<string, number>>> | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all(groups.map(async (g) => [g.kind, await fetchStarCounts(g.kind)] as const)).then((all) => {
      if (!live || all.some(([, c]) => c === null)) return;
      setCounts(Object.fromEntries(all) as Partial<Record<PageKind, Record<string, number>>>);
    });
    return () => {
      live = false;
    };
  }, [groups]);
  if (!counts) return null;
  return (
    <section className={styles.block} aria-labelledby="popular">
      <div className={styles.blockHead}>
        <h2 id="popular">
          <Star size={20} aria-hidden /> ยอดนิยม
        </h2>
        <span className={styles.meta}>เรียงตามจำนวนดาวจากสมาชิก</span>
      </div>
      <div className={styles.popular}>
        {groups.map((g) => {
          const c = counts[g.kind] ?? {};
          const top = g.pages
            .filter((p) => (c[p.slug] ?? 0) > 0)
            .sort((a, b) => c[b.slug] - c[a.slug] || a.title.localeCompare(b.title, "th"))
            .slice(0, TOP_N);
          return (
            <div key={g.kind} className={styles.popularCol}>
              <h3>{g.label}</h3>
              {top.length === 0 ? (
                <p className={styles.meta}>ยังไม่มีใครให้ดาว เปิดหน้าที่ชอบแล้วกดให้ดาวเป็นคนแรก</p>
              ) : (
                <ol className={styles.rank}>
                  {top.map((p) => (
                    <li key={p.slug}>
                      <Link href={p.href}>{p.title}</Link>
                      <span className={styles.stars} data-stars={c[p.slug]}>
                        <Star size={14} aria-hidden /> {c[p.slug]}
                        <span className="sr-only"> ดาว</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Sign-in invitation for anonymous visitors; members see nothing here. */
export function JoinPrompt() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
      .then(async (res) => ((await res.json().catch(() => ({}))) as { user?: unknown }))
      .catch(() => ({}) as { user?: unknown })
      .then((s) => {
        if (live) setSignedIn(Boolean(s.user));
      });
    return () => {
      live = false;
    };
  }, []);
  if (signedIn !== false) return null;
  return (
    <div className={styles.join}>
      <p>อ่านได้ทุกคน อยากร่วมคุยหรือให้ดาวหน้าที่ชอบ เข้าสู่ระบบด้วย Google หรือ LINE ก่อน</p>
      <Link href="/account" className={styles.signIn}>
        เข้าสู่ระบบ
      </Link>
    </div>
  );
}
