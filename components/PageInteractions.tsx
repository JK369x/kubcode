"use client";
import Link from "next/link";
import { MessageCircle, Star, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { send } from "@/lib/interactions/client";
import type { PageKind, PageState, PublicComment } from "@/lib/interactions/store";
import { CommentText } from "./CommentText";
import { SkeletonRows } from "./SkeletonImage";
import styles from "./PageInteractions.module.css";

export type InteractionTarget = { kind: PageKind; slug: string; title: string };

type Loaded = PageState & { extra: PublicComment[] };
type Load = { state: "loading" } | { state: "closed"; message: string } | { state: "ready"; data: Loaded };
type Act = (run: () => Promise<{ ok: boolean; message?: string }>, done: string) => Promise<boolean>;

const MAX = 2000;
const when = (iso: string) =>
  new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

/**
 * Live stars and comments for one page, shared by the desktop rail and the
 * mobile sheet. Pages stay static; state loads after hydration and fails
 * closed (a notice in the same place) when interactions are off.
 */
export function useInteractions({ kind, slug }: InteractionTarget) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [publicName, setPublicName] = useState<string | null>(null);
  const base = `/api/interactions?kind=${kind}&slug=${encodeURIComponent(slug)}`;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(base, { credentials: "same-origin", cache: "no-store" });
      const body = await res.json();
      if (body.available === false) {
        setLoad({ state: "closed", message: "ดาวและคอมเมนต์ยังไม่เปิดใช้งานบนเซิร์ฟเวอร์นี้" });
        return;
      }
      if (!res.ok) {
        setLoad({ state: "closed", message: "ดาวและคอมเมนต์ใช้งานไม่ได้ชั่วคราว ลองใหม่ภายหลัง" });
        return;
      }
      setLoad({ state: "ready", data: { ...(body as PageState), extra: [] } });
      if ((body as PageState).viewer.signedIn && publicName === null) {
        const p = await fetch("/api/interactions/profile", { credentials: "same-origin", cache: "no-store" });
        if (p.ok) setPublicName(((await p.json()) as { publicName: string }).publicName);
      }
    } catch {
      setLoad({ state: "closed", message: "โหลดดาวและคอมเมนต์ไม่สำเร็จ" });
    }
  }, [base, publicName]);

  useEffect(() => {
    void refresh();
    // Load once per page; later refreshes follow actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  const loadMore = useCallback(async () => {
    if (load.state !== "ready" || !load.data.nextCursor) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}&before=${load.data.nextCursor}`, { credentials: "same-origin", cache: "no-store" });
      if (res.ok) {
        const next = (await res.json()) as PageState;
        setLoad({
          state: "ready",
          data: { ...load.data, extra: [...load.data.extra, ...next.comments], nextCursor: next.nextCursor },
        });
      } else setStatus("โหลดคอมเมนต์เพิ่มไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }, [base, load]);

  const act: Act = async (run, done) => {
    setBusy(true);
    const result = await run();
    setStatus(result.ok ? done : (result.message ?? "ทำรายการไม่สำเร็จ"));
    if (result.ok) await refresh();
    setBusy(false);
    return result.ok;
  };

  return { load, status, busy, act, loadMore, publicName };
}

export type Interactions = ReturnType<typeof useInteractions>;

export function StarControl({ target, it, compact = false }: { target: InteractionTarget; it: Interactions; compact?: boolean }) {
  if (it.load.state !== "ready") return null;
  const { data } = it.load;
  const count = <span className={styles.count}>{data.stars.toLocaleString("th-TH")} ดาว</span>;
  if (!data.viewer.signedIn)
    return (
      <div className={styles.starRow}>
        <Link className={styles.star} href="/account">
          <Star size={18} aria-hidden /> {compact ? "ให้ดาว" : "เข้าสู่ระบบเพื่อให้ดาว"}
        </Link>
        {count}
      </div>
    );
  return (
    <div className={styles.starRow}>
      <button
        type="button"
        className={styles.star}
        aria-pressed={data.starred}
        disabled={it.busy}
        onClick={() =>
          it.act(() => send("/api/interactions/star", "POST", { kind: target.kind, slug: target.slug }), data.starred ? "เอาดาวออกแล้ว" : "ให้ดาวแล้ว")
        }
      >
        <Star size={18} fill={data.starred ? "currentColor" : "none"} aria-hidden />
        {data.starred ? "ให้ดาวแล้ว" : "ให้ดาว"}
      </button>
      {count}
    </div>
  );
}

/** Comment list (own scroll) with the composer pinned at the bottom. */
export function CommentsPanel({ target, it, headingId }: { target: InteractionTarget; it: Interactions; headingId: string }) {
  if (it.load.state === "loading")
    return (
      <section className={styles.panel} aria-busy="true" aria-labelledby={headingId}>
        <h2 id={headingId} className={styles.panelHead}>
          คอมเมนต์
        </h2>
        <div className={styles.skeleton}>
          <SkeletonRows rows={3} label="กำลังโหลดคอมเมนต์" />
        </div>
      </section>
    );
  if (it.load.state === "closed")
    return (
      <section className={`${styles.panel} ${styles.panelClosed}`} aria-labelledby={headingId}>
        <h2 id={headingId} className={styles.panelHead}>
          คอมเมนต์
        </h2>
        <p className={`${styles.meta} ${styles.empty}`}>{it.load.message}</p>
      </section>
    );
  const { data } = it.load;
  const all = [...data.comments, ...data.extra];
  const threads = all.filter((c) => c.parentId === null);
  const repliesOf = (id: string) => all.filter((c) => c.parentId === id);
  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.panelHead}>
        คอมเมนต์ ({data.commentCount.toLocaleString("th-TH")})
      </h2>
      <div className={styles.scroll} data-comments-scroll>
        {threads.length === 0 && <p className={`${styles.meta} ${styles.empty}`}>ยังไม่มีคอมเมนต์ เริ่มคนแรกได้เลย</p>}
        <ol className={styles.list}>
          {threads.map((c) => (
            <li key={c.id}>
              <Comment c={c} data={data} it={it} canReply={data.viewer.signedIn && !c.deleted} target={target} />
              {repliesOf(c.id).length > 0 && (
                <ol className={styles.replies}>
                  {repliesOf(c.id).map((r) => (
                    <li key={r.id}>
                      <Comment c={r} data={data} it={it} canReply={false} target={target} />
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
        {data.nextCursor && (
          <button type="button" className={styles.more} onClick={() => it.loadMore()} disabled={it.busy}>
            แสดงเพิ่ม
          </button>
        )}
      </div>
      <p role="status" aria-live="polite" className={`${styles.meta} ${styles.status}`}>
        {it.status}
      </p>
      <div className={styles.composer}>
        {data.viewer.signedIn ? (
          <CommentForm
            label={`เขียนคอมเมนต์เกี่ยวกับ ${target.title}`}
            note={
              <>
                แสดงในชื่อ “{it.publicName === null ? "…" : it.publicName || "สมาชิก"}” · <Link href="/account/settings">เปลี่ยนชื่อ</Link>
              </>
            }
            busy={it.busy}
            submit={(body) =>
              it.act(() => send("/api/interactions/comments", "POST", { kind: target.kind, slug: target.slug, body, parentId: null }), "ส่งคอมเมนต์แล้ว")
            }
          />
        ) : (
          <p className={styles.meta}>
            <Link href="/account">เข้าสู่ระบบ</Link> ด้วย Google หรือ LINE เพื่อคอมเมนต์
          </p>
        )}
      </div>
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
  note?: ReactNode;
  busy: boolean;
  submit: (body: string) => Promise<boolean>;
  initial?: string;
  cancel?: () => void;
}) {
  const id = useId();
  const [text, setText] = useState(initial);
  // Starts as a one-line box; opens with a short animation on focus or when
  // there is text, and folds back when empty and left (owner 2026-11-11).
  const [open, setOpen] = useState(initial !== "" || Boolean(cancel));
  return (
    <form
      className={styles.form}
      data-open={open ? "" : undefined}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && text.trim() === "") setOpen(false);
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (await submit(text)) setText("");
      }}
    >
      <label htmlFor={id} className={open ? styles.label : "sr-only"}>
        {label}
      </label>
      <textarea
        id={id}
        value={text}
        maxLength={MAX}
        rows={open ? 3 : 1}
        placeholder={open ? undefined : "เขียนคอมเมนต์…"}
        onChange={(e) => setText(e.target.value)}
      />
      <div className={styles.formRow} hidden={!open}>
        <span className={styles.meta}>
          {note} {note ? "· " : ""}
          {text.length.toLocaleString("th-TH")}/{MAX.toLocaleString("th-TH")}
        </span>
        <span className={styles.formActions}>
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
  it,
  canReply,
  target,
}: {
  c: PublicComment;
  data: PageState;
  it: Interactions;
  canReply: boolean;
  target: InteractionTarget;
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
          busy={it.busy}
          cancel={() => setMode("view")}
          submit={async (body) => {
            const ok = await it.act(() => send(path, "PATCH", { body }), "แก้คอมเมนต์แล้ว");
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
          <button type="button" disabled={it.busy} onClick={() => it.act(() => send(path, "DELETE"), "ลบคอมเมนต์แล้ว")}>
            ลบ
          </button>
        )}
        {data.viewer.signedIn && !c.mine && (
          <button type="button" disabled={it.busy} onClick={() => it.act(() => send(`${path}/report`, "POST", {}), "รายงานแล้ว ขอบคุณที่แจ้ง")}>
            รายงาน
          </button>
        )}
        {data.viewer.isOwner && (
          <button
            type="button"
            disabled={it.busy}
            onClick={() => it.act(() => send(`${path}/hide`, "POST", { hidden: !c.hidden }), c.hidden ? "แสดงคอมเมนต์แล้ว" : "ซ่อนคอมเมนต์แล้ว")}
          >
            {c.hidden ? "เลิกซ่อน" : "ซ่อน"}
          </button>
        )}
      </div>
      {mode === "reply" && (
        <CommentForm
          label={`ตอบกลับ ${c.author}`}
          busy={it.busy}
          cancel={() => setMode("view")}
          submit={async (body) => {
            const ok = await it.act(
              () => send("/api/interactions/comments", "POST", { kind: target.kind, slug: target.slug, body, parentId: c.id }),
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

/**
 * Mobile/tablet: a floating star + "คอมเมนต์ (n)" bar; comments open in a
 * modal bottom sheet (native <dialog>: focus stays inside, Esc closes, and the
 * browser back button closes it too).
 */
export function CommentSheet({ target, it }: { target: InteractionTarget; it: Interactions }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const count = it.load.state === "ready" ? it.load.data.commentCount : null;

  useEffect(() => {
    const onPop = () => {
      if (dialog.current?.open) dialog.current.close();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const open = () => {
    dialog.current?.showModal();
    history.pushState({ ...history.state, kbSheet: true }, "");
  };
  // Every close path (button, Esc, back) ends here; drop our history entry
  // unless the back button already did.
  const onClose = () => {
    if (history.state?.kbSheet) history.back();
  };

  return (
    <div className={styles.mobileBar}>
      <StarControl target={target} it={it} compact />
      <button type="button" className={styles.fab} onClick={open} aria-haspopup="dialog">
        <MessageCircle size={18} aria-hidden />
        คอมเมนต์{count === null ? "" : ` (${count.toLocaleString("th-TH")})`}
      </button>
      <dialog ref={dialog} className={styles.sheet} aria-labelledby={headingId} onClose={onClose}>
        <button type="button" className={styles.sheetClose} onClick={() => dialog.current?.close()} aria-label="ปิดคอมเมนต์">
          <X size={20} aria-hidden />
        </button>
        <CommentsPanel target={target} it={it} headingId={headingId} />
      </dialog>
    </div>
  );
}
