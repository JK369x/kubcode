"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { send } from "@/lib/interactions/client";
import { MAX_DM_CHARS, MAX_PUBLIC_REPLY_CHARS, dmHasLink, type MatchMode } from "@/lib/automations/rules";
import type { AutomationChannel, RuleView } from "@/lib/automations/store";
import type { RecentOutcome } from "@/lib/automations/view";
import type { PickerPost } from "@/lib/automations/posts";
import { SkeletonImg } from "./SkeletonImage";
import keys from "./KeysSettings.module.css";
import styles from "./AutomationsPanel.module.css";

type Props = {
  channel: AutomationChannel;
  rules: RuleView[];
  usage: { count: number; cap: number };
  recent: RecentOutcome[];
};

type Draft = {
  keywords: string;
  mode: MatchMode;
  scope: "all" | "post";
  postId: string;
  publicReply: string;
  dmText: string;
  afterDm: boolean;
};

const EMPTY: Draft = { keywords: "", mode: "contains", scope: "all", postId: "", publicReply: "", dmText: "", afterDm: true };
const DM_PLACEHOLDER = "ขอบคุณที่สนใจนะ นี่ลิงก์ที่ขอไว้ https://kubcode.dev/go/<slug>";

const MODE_LABEL: Record<MatchMode, string> = {
  contains: "มีคำนี้อยู่ในคอมเมนต์",
  exact: "คอมเมนต์ตรงกับคำนี้ทั้งข้อความ",
};

const number = new Intl.NumberFormat("en-US");
const time = (iso: string) =>
  new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(iso));

const draftOf = (r: RuleView): Draft => ({
  keywords: r.keywords.join(", "),
  mode: r.matchMode,
  scope: r.platformPostId ? "post" : "all",
  postId: r.platformPostId ?? "",
  publicReply: r.publicReply ?? "",
  dmText: r.dmText ?? "",
  afterDm: r.replyPolicy === "after_dm",
});

const bodyOf = (d: Draft, tiktok: boolean) =>
  tiktok
    ? // TikTok has no private reply: the public reply is the whole answer.
      { keywords: d.keywords, mode: d.mode, scope: d.scope === "all" ? "all" : d.postId, publicReply: d.publicReply }
    : {
        keywords: d.keywords,
        mode: d.mode,
        scope: d.scope === "all" ? "all" : d.postId,
        publicReply: d.publicReply,
        dmText: d.dmText,
        replyPolicy: d.afterDm ? "after_dm" : "always",
      };

/** Shown on the TikTok page wherever a DM would be expected. */
export const TIKTOK_PUBLIC_ONLY = "TikTok ตอบได้แค่ในคอมเมนต์ ส่ง DM ไม่ได้";

const day = (iso: string) =>
  new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(new Date(iso));

type PostsState = { state: "idle" | "loading" } | { state: "ready"; posts: PickerPost[]; complete: boolean } | { state: "failed"; message: string };

/** The channel's recent posts, read once when something needs them. */
function useChannelPosts(channelId: string, wanted: boolean) {
  const [posts, setPosts] = useState<PostsState>({ state: "idle" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    setPosts({ state: "loading" });
    fetch(`/api/channels/${channelId}/posts`, { credentials: "same-origin" })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { posts?: PickerPost[]; complete?: boolean; message?: string };
        if (!live) return;
        if (res.ok && Array.isArray(body.posts)) setPosts({ state: "ready", posts: body.posts, complete: body.complete === true });
        else setPosts({ state: "failed", message: body.message ?? "โหลดโพสต์ของช่องนี้ไม่ได้ตอนนี้" });
      })
      .catch(() => live && setPosts({ state: "failed", message: "โหลดโพสต์ของช่องนี้ไม่ได้ตอนนี้" }));
    return () => {
      live = false;
    };
  }, [channelId, wanted, attempt]);
  return { posts, retry: () => setAttempt((n) => n + 1) };
}

/** A post as the owner recognises it: thumbnail and caption, else its id. */
function PostSummary({ post, id, tiktok }: { post: PickerPost | undefined; id: string; tiktok: boolean }) {
  if (!post) return <>{`เฉพาะ${tiktok ? "วิดีโอ" : "โพสต์"} ID ${id}`}</>;
  return (
    <span className={styles.summary}>
      {post.thumbnailUrl && <img src={post.thumbnailUrl} alt="" referrerPolicy="no-referrer" width={48} height={48} loading="lazy" decoding="async" />}
      <span>
        {post.caption || `${tiktok ? "วิดีโอ" : "โพสต์"}ที่ไม่มีคำบรรยาย`}
        <span className={styles.postMeta}>
          {post.createdAt ? day(post.createdAt) : `ID ${id}`}
          {post.permalink && (
            <>
              {" · "}
              <a href={post.permalink} target="_blank" rel="noopener noreferrer">
                เปิดดู
              </a>
            </>
          )}
        </span>
      </span>
    </span>
  );
}

export function AutomationsPanel({ channel, rules, usage, recent }: Props) {
  const router = useRouter();
  const base = `/api/channels/${channel.id}/automations`;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const formRef = useRef<HTMLElement>(null);
  const firstField = useRef<HTMLTextAreaElement>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const tiktok = channel.platform === "tiktok";
  const noLink = tiktok
    ? draft.publicReply.trim() !== "" && !dmHasLink(draft.publicReply)
    : draft.dmText.trim() !== "" && !dmHasLink(draft.dmText);
  const who = channel.handle ? `@${channel.handle}` : channel.displayName;
  const full = usage.count >= usage.cap;
  const [manual, setManual] = useState(false);
  const needPosts = draft.scope === "post" || rules.some((r) => r.platformPostId);
  const { posts, retry } = useChannelPosts(channel.id, needPosts);
  const listed = posts.state === "ready" ? posts.posts : [];
  const postById = (id: string) => listed.find((p) => p.platformPostId === id);
  const noun = tiktok ? "วิดีโอ" : "โพสต์";
  // An edited rule whose post is not in the list keeps its id in the manual field.
  const showManual = manual || posts.state === "failed" || (posts.state === "ready" && draft.postId !== "" && !postById(draft.postId));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = editing ? await send(`${base}/${editing}`, "PATCH", bodyOf(draft, tiktok)) : await send(base, "POST", bodyOf(draft, tiktok));
    setBusy(false);
    if (!r.ok) return setStatus(r.message);
    setStatus(editing ? "บันทึกการแก้ไขแล้ว" : "เพิ่มกฎแล้ว");
    setEditing(null);
    setDraft(EMPTY);
    setManual(false);
    router.refresh();
  }

  function onEdit(rule: RuleView) {
    setEditing(rule.id);
    setConfirmDelete(null);
    setDraft(draftOf(rule));
    setManual(false);
    setStatus("");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    firstField.current?.focus({ preventScroll: true });
  }

  function onCancelEdit() {
    setEditing(null);
    setDraft(EMPTY);
    setManual(false);
  }

  async function onToggle(rule: RuleView) {
    setBusy(true);
    const r = await send(`${base}/${rule.id}`, "PATCH", { active: !rule.active });
    setBusy(false);
    setStatus(r.ok ? (rule.active ? "พักกฎไว้แล้ว" : "เปิดใช้กฎแล้ว") : r.message);
    if (r.ok) router.refresh();
  }

  async function onDelete(rule: RuleView) {
    if (confirmDelete !== rule.id) {
      setConfirmDelete(rule.id);
      return setStatus("กดยืนยันลบอีกครั้งเพื่อลบกฎนี้");
    }
    setBusy(true);
    const r = await send(`${base}/${rule.id}`, "DELETE");
    setBusy(false);
    setConfirmDelete(null);
    setStatus(r.ok ? "ลบกฎแล้ว" : r.message);
    if (r.ok) {
      if (editing === rule.id) onCancelEdit();
      router.refresh();
    }
  }

  return (
    <div className={keys.keys}>
      {tiktok ? (
        <>
          <p className={keys.lead}>
            เมื่อมีคนคอมเมนต์คำที่ตั้งไว้ใต้วิดีโอ TikTok ของ {who} ระบบจะตอบใต้คอมเมนต์นั้นให้ หนึ่งคนได้คำตอบครั้งเดียวต่อวิดีโอ
          </p>
          <p className={styles.notice} role="note">
            <strong>{TIKTOK_PUBLIC_ONLY}</strong> คำตอบจะขึ้นเป็นคอมเมนต์สาธารณะที่ทุกคนเห็น ใส่ลิงก์หรือบอกให้ดูลิงก์ในไบโอได้
          </p>
        </>
      ) : (
        <p className={keys.lead}>
          เมื่อมีคนคอมเมนต์คำที่ตั้งไว้ใต้โพสต์ของ {who} ระบบจะส่ง DM พร้อมลิงก์ให้ และตอบใต้คอมเมนต์ให้ด้วยถ้าตั้งข้อความไว้
          หนึ่งคนได้ DM ได้ครั้งเดียวต่อโพสต์
        </p>
      )}
      <p className={keys.status} role="status" aria-live="polite">
        {status}
      </p>

      <section className={keys.section} aria-labelledby="automations-usage">
        <h2 id="automations-usage">{tiktok ? "โควตาคำตอบของช่องนี้" : "โควตา DM ของช่องนี้"}</h2>
        <p className={styles.usage}>
          {tiktok ? "คำตอบเดือนนี้" : "DM เดือนนี้"}: {number.format(usage.count)} / {number.format(usage.cap)}
        </p>
        <meter className={styles.meter} min={0} max={usage.cap} value={Math.min(usage.count, usage.cap)} aria-labelledby="automations-usage" />
        <p className={keys.meta}>
          {full
            ? `ครบโควตาเดือนนี้แล้ว คอมเมนต์ที่ตรงกฎจะไม่ได้รับ${tiktok ? "คำตอบ" : " DM"} จนถึงวันที่ 1 ของเดือนหน้า`
            : "นับตามเวลาไทย เริ่มนับใหม่ทุกวันที่ 1 ของเดือน"}
        </p>
      </section>

      <section className={keys.section} aria-labelledby="automations-rules">
        <h2 id="automations-rules">กฎของช่องนี้</h2>
        {rules.length === 0 ? (
          <p className={keys.meta}>ยังไม่มีกฎ เพิ่มกฎแรกได้ด้านล่าง</p>
        ) : (
          <ul className={styles.rules}>
            {rules.map((r) => (
              <li key={r.id} className={r.active ? styles.rule : `${styles.rule} ${styles.paused}`}>
                <span className={styles.badge}>{r.active ? "ใช้งานอยู่" : "พักไว้"}</span>
                <dl>
                  <dt>คีย์เวิร์ด</dt>
                  <dd>{r.keywords.join(", ")}</dd>
                  <dt>จับคำแบบ</dt>
                  <dd>{MODE_LABEL[r.matchMode]}</dd>
                  <dt>โพสต์</dt>
                  <dd>{r.platformPostId ? <PostSummary post={postById(r.platformPostId)} id={r.platformPostId} tiktok={tiktok} /> : `ทุก${noun}`}</dd>
                  <dt>ตอบใต้คอมเมนต์</dt>
                  <dd>
                    {tiktok
                      ? (r.publicReply ?? "ไม่ตอบ")
                      : r.publicReply
                        ? `${r.publicReply} (${r.replyPolicy === "after_dm" ? "เฉพาะเมื่อส่ง DM สำเร็จ" : "ทุกครั้ง"})`
                        : "ไม่ตอบ"}
                  </dd>
                  <dt>ข้อความ DM</dt>
                  <dd>{tiktok ? TIKTOK_PUBLIC_ONLY : r.dmText}</dd>
                </dl>
                <div className={keys.actions}>
                  <button type="button" disabled={busy} onClick={() => onEdit(r)} aria-label={`แก้ไขกฎ ${r.keywords.join(", ")}`}>
                    แก้ไข
                  </button>
                  <button type="button" disabled={busy} onClick={() => onToggle(r)} aria-label={`${r.active ? "พัก" : "เปิดใช้"}กฎ ${r.keywords.join(", ")}`}>
                    {r.active ? "พักกฎ" : "เปิดใช้"}
                  </button>
                  <button
                    type="button"
                    className={keys.danger}
                    disabled={busy}
                    onClick={() => onDelete(r)}
                    aria-label={`${confirmDelete === r.id ? "ยืนยันลบ" : "ลบ"}กฎ ${r.keywords.join(", ")}`}
                  >
                    {confirmDelete === r.id ? "ยืนยันลบ" : "ลบ"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={keys.section} aria-labelledby="automations-form" ref={formRef}>
        <h2 id="automations-form">{editing ? "แก้ไขกฎ" : "เพิ่มกฎ"}</h2>
        <form className={`${keys.form} ${styles.form}`} onSubmit={onSubmit}>
          <label htmlFor="rule-keywords">
            คีย์เวิร์ด
            <textarea
              id="rule-keywords"
              ref={firstField}
              rows={2}
              value={draft.keywords}
              onChange={(e) => set("keywords", e.target.value)}
              disabled={busy}
              required
              placeholder="ขอลิงก์, link"
              aria-describedby="rule-keywords-hint"
            />
            <span id="rule-keywords-hint" className={keys.meta}>
              หลายคำคั่นด้วยจุลภาคหรือขึ้นบรรทัดใหม่ ได้สูงสุด 20 คำ ตัวพิมพ์เล็กใหญ่ถือว่าเหมือนกัน
            </span>
          </label>
          <label htmlFor="rule-mode">
            จับคำแบบ
            <select id="rule-mode" value={draft.mode} onChange={(e) => set("mode", e.target.value as MatchMode)} disabled={busy}>
              <option value="contains">{MODE_LABEL.contains}</option>
              <option value="exact">{MODE_LABEL.exact}</option>
            </select>
          </label>
          <fieldset disabled={busy}>
            <legend>ใช้กับโพสต์ไหน</legend>
            <label className={styles.check}>
              <input type="radio" name="rule-scope" checked={draft.scope === "all"} onChange={() => set("scope", "all")} />
              ทุกโพสต์
            </label>
            <label className={styles.check}>
              <input type="radio" name="rule-scope" checked={draft.scope === "post"} onChange={() => set("scope", "post")} />
              เฉพาะโพสต์เดียว
            </label>
            {draft.scope === "post" && (
              <div className={styles.picker}>
                <p id="rule-post-hint" className={keys.meta}>
                  เลือก{noun}ที่ต้องการ กฎของ{noun}เดียวจะถูกใช้ก่อนกฎทุก{noun}
                </p>
                {posts.state === "loading" || posts.state === "idle" ? (
                  <div className={styles.posts} role="status" aria-busy="true">
                    <span className={styles.visuallyHidden}>กำลังโหลด{noun}ล่าสุดของช่องนี้…</span>
                    {Array.from({ length: 6 }, (_, i) => (
                      <div key={i} className={styles.post} aria-hidden="true">
                        <span className={styles.thumbBox}>
                          <span className="img-skeleton" />
                        </span>
                        <span className="skeleton-line" style={{ width: "80%" }} />
                        <span className="skeleton-line skeleton-line-short" />
                      </div>
                    ))}
                  </div>
                ) : posts.state === "failed" ? (
                  <p className={keys.meta} role="status">
                    {posts.message}{" "}
                    <button type="button" className={styles.linkButton} onClick={retry}>
                      ลองอีกครั้ง
                    </button>
                  </p>
                ) : listed.length === 0 ? (
                  <p className={keys.meta}>ยังไม่พบ{noun}ของช่องนี้ ใส่ ID เองได้ด้านล่าง</p>
                ) : (
                  <div role="radiogroup" aria-labelledby="rule-post-legend" aria-describedby="rule-post-hint" className={styles.posts}>
                    <span id="rule-post-legend" className={styles.visuallyHidden}>
                      {noun}ล่าสุดของช่องนี้
                    </span>
                    {listed.map((p) => {
                      const chosen = draft.postId === p.platformPostId && !showManual;
                      return (
                        <div key={p.platformPostId} className={chosen ? `${styles.post} ${styles.chosen}` : styles.post}>
                          <label className={styles.postPick}>
                            <input
                              type="radio"
                              name="rule-post-pick"
                              value={p.platformPostId}
                              checked={chosen}
                              onChange={() => {
                                setManual(false);
                                set("postId", p.platformPostId);
                              }}
                              required={!showManual}
                            />
                            {p.thumbnailUrl && (
                              <span className={styles.thumbBox}>
                                <SkeletonImg className={styles.thumb} src={p.thumbnailUrl} alt="" referrerPolicy="no-referrer" width={150} height={188} />
                              </span>
                            )}
                            <span className={p.thumbnailUrl ? styles.caption : `${styles.caption} ${styles.captionOnly}`}>
                              {p.caption || `${noun}ที่ไม่มีคำบรรยาย`}
                            </span>
                            <span className={styles.postMeta}>
                              {p.createdAt ? day(p.createdAt) : `ID ${p.platformPostId}`}
                              {p.kubcode ? " · โพสต์จาก kubcode" : ""}
                            </span>
                          </label>
                          {p.permalink && (
                            <a className={styles.open} href={p.permalink} target="_blank" rel="noopener noreferrer">
                              เปิดดูใน{tiktok ? " TikTok" : " Instagram"}
                              <span className={styles.visuallyHidden}>: {p.caption || p.platformPostId}</span>
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {posts.state === "ready" && !posts.complete && (
                  <p className={keys.meta}>แสดงเฉพาะ{noun}ที่โพสต์ผ่าน kubcode เพราะโหลดรายการจาก{tiktok ? " TikTok" : " Instagram"} ไม่ได้ตอนนี้</p>
                )}
                {showManual ? (
                  <label htmlFor="rule-post">
                    {tiktok ? "ID ของวิดีโอใน TikTok" : "ID ของโพสต์ใน Instagram"}
                    <input
                      id="rule-post"
                      value={draft.postId}
                      onChange={(e) => set("postId", e.target.value)}
                      required
                      inputMode="numeric"
                      pattern="[0-9]{1,64}"
                      autoComplete="off"
                      spellCheck={false}
                      aria-describedby="rule-post-manual-hint"
                    />
                    <span id="rule-post-manual-hint" className={keys.meta}>
                      {tiktok
                        ? "ตัวเลขท้ายลิงก์วิดีโอ เช่น tiktok.com/@kubcode/video/7300000000000000001"
                        : "media id ตัวเลขล้วน เช่น 17895695668004550 (ไม่ใช่ตัวอักษรในลิงก์ instagram.com)"}
                    </span>
                  </label>
                ) : null}
                <button
                  type="button"
                  className={styles.linkButton}
                  aria-expanded={showManual}
                  aria-controls={showManual ? "rule-post" : undefined}
                  onClick={() => {
                    if (showManual && posts.state === "ready" && postById(draft.postId) === undefined) set("postId", "");
                    setManual(!showManual);
                  }}
                  disabled={posts.state === "failed"}
                >
                  {showManual ? `เลือกจาก${noun}ล่าสุดแทน` : "ใส่ ID เอง"}
                </button>
              </div>
            )}
          </fieldset>
          <label htmlFor="rule-reply">
            {tiktok ? "ข้อความตอบใต้คอมเมนต์" : "ข้อความตอบใต้คอมเมนต์ (ไม่บังคับ)"}
            <textarea
              id="rule-reply"
              rows={tiktok ? 4 : 2}
              value={draft.publicReply}
              onChange={(e) => set("publicReply", e.target.value)}
              disabled={busy}
              required={tiktok}
              maxLength={MAX_PUBLIC_REPLY_CHARS}
              placeholder={tiktok ? "ขอบคุณที่สนใจ ลิงก์อยู่ในไบโอนะ" : "ส่งให้ใน DM แล้วนะ"}
              aria-describedby={tiktok ? "rule-reply-hint" : undefined}
            />
            {tiktok && (
              <span id="rule-reply-hint" className={keys.meta}>
                ต้องใส่ ช่องนี้คือคำตอบทั้งหมด เพราะ {TIKTOK_PUBLIC_ONLY} ทุกคนที่เปิดคอมเมนต์จะเห็นข้อความนี้
              </span>
            )}
          </label>
          {tiktok ? (
            <p className={keys.meta}>ข้อความ DM: {TIKTOK_PUBLIC_ONLY}</p>
          ) : (
            <>
              <label htmlFor="rule-dm">
                ข้อความ DM
                <textarea
                  id="rule-dm"
                  rows={4}
                  value={draft.dmText}
                  onChange={(e) => set("dmText", e.target.value)}
                  disabled={busy}
                  required
                  maxLength={MAX_DM_CHARS}
                  placeholder={DM_PLACEHOLDER}
                  aria-describedby="rule-dm-hint"
                />
                <span id="rule-dm-hint" className={noLink ? `${keys.meta} ${styles.warn}` : keys.meta}>
                  {noLink
                    ? "ข้อความนี้ยังไม่มีลิงก์ https:// บันทึกได้ แต่คนที่ได้ DM จะไม่มีลิงก์ให้กด"
                    : "ส่งเป็นข้อความธรรมดา ใส่ลิงก์ไว้ในข้อความได้เลย ไม่เกิน 1,000 ตัวอักษร"}
                </span>
              </label>
              <label className={styles.check}>
                <input type="checkbox" checked={draft.afterDm} onChange={(e) => set("afterDm", e.target.checked)} disabled={busy} />
                ตอบสาธารณะเฉพาะเมื่อส่ง DM สำเร็จ
              </label>
            </>
          )}
          <div className={keys.actions}>
            <button type="submit" className="primary" disabled={busy}>
              {editing ? "บันทึกการแก้ไข" : "เพิ่มกฎ"}
            </button>
            {editing && (
              <button type="button" disabled={busy} onClick={onCancelEdit}>
                ยกเลิก
              </button>
            )}
          </div>
        </form>
      </section>

      <section className={keys.section} aria-labelledby="automations-recent">
        <h2 id="automations-recent">ผลล่าสุด</h2>
        {recent.length === 0 ? (
          <p className={keys.meta}>ยังไม่มีคอมเมนต์ที่ตรงกฎ</p>
        ) : (
          <ul className={keys.history}>
            {recent.map((o, i) => (
              <li key={`${o.receivedAt}-${i}`}>
                <strong>{o.label}</strong>
                <span className={keys.meta}>
                  {time(o.receivedAt)} · {postById(o.platformPostId)?.caption || `${noun} ID ${o.platformPostId}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
