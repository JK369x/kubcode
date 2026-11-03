"use client";
import Link from "next/link";
import { Star } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { send } from "@/lib/interactions/client";
import type { PageState, PublicComment } from "@/lib/interactions/store";
import { CommentText } from "./CommentText";
import styles from "./PageInteractions.module.css";

type Props = { kind: "tool" | "skill"; slug: string; title: string };
type Load = { state: "loading" } | { state: "closed"; message: string } | { state: "ready"; data: PageState };

const MAX = 2000;
const when = (iso: string) =>
  new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

/**
 * Stars and comments for one tool or skill page. Content pages stay static;
 * this loads live state from /api/interactions after hydration and fails
 * closed (a short notice) when accounts or the database are unavailable.
 */
export function PageInteractions({ kind, slug, title }: Props) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [publicName, setPublicName] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/interactions?kind=${kind}&slug=${encodeURIComponent(slug)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = await res.json();
      if (body.available === false) {
        setLoad({ state: "closed", message: "ดาวและคอมเมนต์ยังไม่เปิดใช้งานบนเซิร์ฟเวอร์นี้" });
        return;
      }
      if (!res.ok) {
        setLoad({ state: "closed", message: "ดาวและคอมเมนต์ใช้งานไม่ได้ชั่วคราว ลองใหม่ภายหลัง" });
        return;
      }
      setLoad({ state: "ready", data: body as PageState });
      if ((body as PageState).viewer.signedIn) {
        const p = await fetch("/api/interactions/profile", { credentials: "same-origin", cache: "no-store" });
        if (p.ok) setPublicName(((await p.json()) as { publicName: string }).publicName);
      }
    } catch {
      setLoad({ state: "closed", message: "โหลดดาวและคอมเมนต์ไม่สำเร็จ" });
    }
  }, [kind, slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function act(run: () => Promise<{ ok: boolean; message?: string }>, done: string) {
    setBusy(true);
    const result = await run();
    setStatus(result.ok ? done : (result.message ?? "ทำรายการไม่สำเร็จ"));
    if (result.ok) await refresh();
    setBusy(false);
    return result.ok;
  }

  if (load.state === "loading") return <section className={styles.box} aria-busy="true" aria-label="ดาวและคอมเมนต์" />;
  if (load.state === "closed")
    return (
      <section className={styles.box} aria-label="ดาวและคอมเมนต์">
        <p className={styles.meta}>{load.message}</p>
      </section>
    );

  const { data } = load;
  const top = data.comments.filter((c) => c.parentId === null);
  const repliesOf = (id: string) => data.comments.filter((c) => c.parentId === id);
  const thread = { data, busy, act };

  return (
    <section className={styles.box} aria-labelledby={`${slug}-talk`}>
      <div className={styles.starRow}>
        {data.viewer.signedIn ? (
          <button
            type="button"
            className={styles.star}
            aria-pressed={data.starred}
            disabled={busy}
            onClick={() =>
              act(() => send("/api/interactions/star", "POST", { kind, slug }), data.starred ? "เอาดาวออกแล้ว" : "ให้ดาวแล้ว")
            }
          >
            <Star size={18} fill={data.starred ? "currentColor" : "none"} aria-hidden />
            {data.starred ? "ให้ดาวแล้ว" : "ให้ดาว"}
          </button>
        ) : (
          <Link className={styles.star} href="/account">
            <Star size={18} aria-hidden /> เข้าสู่ระบบเพื่อให้ดาว
          </Link>
        )}
        <span className={styles.count} aria-label={`${data.stars} ดาว`}>
          {data.stars.toLocaleString("th-TH")} ดาว
        </span>
      </div>

      <h2 id={`${slug}-talk`}>คอมเมนต์ ({top.length})</h2>
      <p role="status" aria-live="polite" className={styles.meta}>
        {status}
      </p>

      {data.viewer.signedIn ? (
        <CommentForm
          label={`เขียนคอมเมนต์เกี่ยวกับ ${title}`}
          note={
            <>
              แสดงในชื่อ “{publicName === null ? "…" : publicName || "สมาชิก"}” ·{" "}
              <Link href="/account/settings">เปลี่ยนชื่อ</Link>
            </>
          }
          busy={busy}
          submit={(body) =>
            act(() => send("/api/interactions/comments", "POST", { kind, slug, body, parentId: null }), "ส่งคอมเมนต์แล้ว")
          }
        />
      ) : (
        <p className={styles.meta}>
          <Link href="/account">เข้าสู่ระบบ</Link> ด้วย Google หรือ LINE เพื่อคอมเมนต์
        </p>
      )}

      <ol className={styles.list}>
        {top.map((c) => (
          <li key={c.id}>
            <Comment c={c} {...thread} canReply={data.viewer.signedIn && !c.deleted} kind={kind} slug={slug} />
            {repliesOf(c.id).length > 0 && (
              <ol className={styles.replies}>
                {repliesOf(c.id).map((r) => (
                  <li key={r.id}>
                    <Comment c={r} {...thread} canReply={false} kind={kind} slug={slug} />
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function CommentForm({
  label,
  note,
  busy,
  submit,
  initial = "",
  cancel,
}: {
  label: string;
  note?: React.ReactNode;
  busy: boolean;
  submit: (body: string) => Promise<boolean>;
  initial?: string;
  cancel?: () => void;
}) {
  const id = useId();
  const [text, setText] = useState(initial);
  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault();
        if (await submit(text)) setText("");
      }}
    >
      <label htmlFor={id}>{label}</label>
      <textarea id={id} value={text} maxLength={MAX} rows={3} onChange={(e) => setText(e.target.value)} />
      <div className={styles.formRow}>
        <span className={styles.meta}>
          {note} {note ? "· " : ""}
          {text.length.toLocaleString("th-TH")}/{MAX.toLocaleString("th-TH")}
        </span>
        <span>
          {cancel && (
            <button type="button" onClick={cancel} disabled={busy}>
              ยกเลิก
            </button>
          )}
          <button type="submit" className="primary" disabled={busy || text.trim() === ""}>
            ส่ง
          </button>
        </span>
      </div>
    </form>
  );
}

function Comment({
  c,
  data,
  busy,
  act,
  canReply,
  kind,
  slug,
}: {
  c: PublicComment;
  data: PageState;
  busy: boolean;
  act: (run: () => Promise<{ ok: boolean; message?: string }>, done: string) => Promise<boolean>;
  canReply: boolean;
  kind: "tool" | "skill";
  slug: string;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "reply">("view");
  const path = `/api/interactions/comments/${c.id}`;
  if (c.deleted) return <p className={styles.meta}>คอมเมนต์นี้ถูกลบแล้ว</p>;
  return (
    <article className={c.hidden ? `${styles.comment} ${styles.hidden}` : styles.comment}>
      <header className={styles.meta}>
        <strong>{c.author}</strong> · <time dateTime={c.createdAt}>{when(c.createdAt)}</time>
        {c.editedAt && " · แก้ไขแล้ว"}
        {c.hidden && " · ซ่อนอยู่"}
        {data.viewer.isOwner && c.reports ? ` · ถูกรายงาน ${c.reports} ครั้ง` : ""}
      </header>
      {mode === "edit" ? (
        <CommentForm
          label="แก้คอมเมนต์"
          initial={c.body}
          busy={busy}
          cancel={() => setMode("view")}
          submit={async (body) => {
            const ok = await act(() => send(path, "PATCH", { body }), "แก้คอมเมนต์แล้ว");
            if (ok) setMode("view");
            return ok;
          }}
        />
      ) : (
        <p className={styles.body}>
          <CommentText text={c.body} />
        </p>
      )}
      <div className={styles.actions}>
        {canReply && mode === "view" && (
          <button type="button" onClick={() => setMode("reply")}>
            ตอบกลับ
          </button>
        )}
        {c.mine && mode === "view" && !c.hidden && (
          <button type="button" onClick={() => setMode("edit")}>
            แก้ไข
          </button>
        )}
        {c.mine && (
          <button type="button" disabled={busy} onClick={() => act(() => send(path, "DELETE"), "ลบคอมเมนต์แล้ว")}>
            ลบ
          </button>
        )}
        {data.viewer.signedIn && !c.mine && (
          <button type="button" disabled={busy} onClick={() => act(() => send(`${path}/report`, "POST", {}), "รายงานแล้ว ขอบคุณที่แจ้ง")}>
            รายงาน
          </button>
        )}
        {data.viewer.isOwner && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act(() => send(`${path}/hide`, "POST", { hidden: !c.hidden }), c.hidden ? "แสดงคอมเมนต์แล้ว" : "ซ่อนคอมเมนต์แล้ว")}
          >
            {c.hidden ? "เลิกซ่อน" : "ซ่อน"}
          </button>
        )}
      </div>
      {mode === "reply" && (
        <CommentForm
          label={`ตอบกลับ ${c.author}`}
          busy={busy}
          cancel={() => setMode("view")}
          submit={async (body) => {
            const ok = await act(
              () => send("/api/interactions/comments", "POST", { kind, slug, body, parentId: c.id }),
              "ส่งคำตอบแล้ว",
            );
            if (ok) setMode("view");
            return ok;
          }}
        />
      )}
    </article>
  );
}
