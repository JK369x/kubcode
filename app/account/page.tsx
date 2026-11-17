import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  ChevronRight,
  Clapperboard,
  CreditCard,
  Download,
  KeyRound,
  MessageSquareReply,
  MessagesSquare,
  Plug,
  Plus,
  Star,
} from "lucide-react";
import { AccountForm } from "@/components/AccountForm";
import { AccountShortcuts } from "@/components/AccountShortcuts";
import { BillingBanner } from "@/components/BillingBanner";
import { Onboarding } from "@/components/Onboarding";
import { capabilitiesFromCookies } from "@/lib/account-nav/capabilities";
import { PlatformLogo, type Platform } from "@/components/PlatformLogo";
import { FamilyChip, IconTile, PageHero } from "@/components/site/PageHero";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { getBillingPage, thaiDateTime } from "@/lib/billing/view";
import { getChannelsView } from "@/lib/channels/view";
import { getPostsView } from "@/lib/posts/view";
import { avatarInitial } from "@/lib/avatar";
import { Button } from "@/components/ui/button";
import { getAccountView } from "@/lib/auth";
import { SESSION_COOKIE_NAME, authErrorMessage, canonicalHostRedirect, safeNext, readAuthConfig } from "@/lib/auth-policy";
import { accountsEnabled } from "@/lib/accounts/view";
import styles from "./account.module.css";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Same wording as /account/billing.
const STANDING: Record<string, { label: string; variant: "ok" | "warn" | "neutral" }> = {
  active: { label: "ใช้งานอยู่", variant: "ok" },
  grace: { label: "หมดอายุ · ช่วงผ่อนผัน 3 วัน", variant: "warn" },
  lapsed: { label: "หมดอายุ · ช่องถูกพัก", variant: "warn" },
  none: { label: "ยังไม่มีแพ็กเกจ", variant: "neutral" },
  exempt: { label: "บัญชีเจ้าของเว็บ (ไม่ต้องชำระ)", variant: "ok" },
};
// Same wording as /account/channels.
const CHANNEL_STATUS: Record<string, string> = {
  active: "เชื่อมอยู่",
  needs_reconnect: "ต้องเชื่อมใหม่",
  disconnected: "ยกเลิกการเชื่อมแล้ว",
};
/** A post's deliveries as at most two status pills (same labels as /account/posts). */
const POST_STATUS: Record<string, { label: string; variant: "ok" | "warn" | "info" | "neutral" }> = {
  published: { label: "เผยแพร่แล้ว", variant: "ok" },
  scheduled: { label: "ตั้งเวลาแล้ว", variant: "info" },
  pending: { label: "กำลังส่ง", variant: "info" },
  publishing: { label: "กำลังเผยแพร่", variant: "info" },
  failed: { label: "ล้มเหลว", variant: "warn" },
  rejected: { label: "ไม่ผ่านการตรวจ", variant: "warn" },
  cancelled: { label: "ยกเลิกแล้ว", variant: "neutral" },
};
function summarize(statuses: string[]) {
  const counts = new Map<string, number>();
  for (const st of statuses) counts.set(st, (counts.get(st) ?? 0) + 1);
  return [...counts.entries()].slice(0, 2).map(([st, n]) => {
    const s = POST_STATUS[st] ?? POST_STATUS.pending;
    return { label: n > 1 ? `${s.label} ${n}` : s.label, variant: s.variant };
  });
}
const isPlatform = (p: string): p is Platform => p === "youtube" || p === "instagram" || p === "tiktok" || p === "facebook";

/** What signing in gives today; each line restates the membership notes below. */
const AFTER_SIGN_IN = [
  { icon: Star, text: "ให้ดาวและคอมเมนต์บทความกับหน้าเครื่องมือ" },
  { icon: Download, text: "ยืนยันตัวตนก่อนดาวน์โหลด (ดาวน์โหลดยังปิดอยู่สำหรับทุกคน)" },
  { icon: Plug, text: "เชื่อมช่อง YouTube, Instagram, TikTok เมื่อสมัครแพ็กเกจโซเชียล" },
] as const;

export default async function Account({ searchParams }: Props) {
  if (readAuthConfig(process.env).ok) {
    const redirectTo = canonicalHostRedirect(await headers());
    if (redirectTo) redirect(redirectTo);
  }
  const view = await getAccountView();
  // In-site renewal reminder (ADR 0008); nothing when billing is off.
  const billing = view.state === "signed-in" ? await getBillingPage(process.env, () => cookies()) : null;
  // Doors to the paid product (channels, posting, comment rules, billing).
  const caps = view.state === "signed-in" ? await capabilitiesFromCookies(process.env, (await cookies()).get(SESSION_COOKIE_NAME)?.value) : null;
  // Connected channels for the overview; only for members who may use publishing.
  const channels = caps?.publishing ? await getChannelsView(process.env, () => cookies()) : null;
  const { error, account_notice: accountNotice, next } = await searchParams;
  // Central accounts are ON with a usable configuration (DB truth is checked per request).
  const settingsAvailable = accountsEnabled();
  const formProps =
    view.state === "signed-out"
      ? {
          ...view,
          next: safeNext(next),
          errorMessage:
            authErrorMessage(error) ??
            (accountNotice === "linked"
              ? "เชื่อมวิธีเข้าสู่ระบบแล้ว ทุกอุปกรณ์ออกจากระบบแล้ว กรุณาเข้าสู่ระบบใหม่"
              : accountNotice === "unlinked"
                ? "ยกเลิกการเชื่อมแล้ว ทุกอุปกรณ์ออกจากระบบแล้ว กรุณาเข้าสู่ระบบใหม่"
                : null),
        }
      : view.state === "signed-in"
        ? { ...view, settingsAvailable }
        : view;

  const setupNotice = (
    <p className={styles.notice}>
      <BadgeCheck aria-hidden="true" />
      <span>
        {settingsAvailable
          ? "เราเก็บแค่วิธีเข้าสู่ระบบที่คุณเชื่อมไว้ ระบบอนุมัติสมาชิกยังไม่เปิด"
          : "ระบบอนุมัติสมาชิกยังไม่เปิด เราจึงยังไม่เก็บบัญชีสมาชิกไว้ในฐานข้อมูล"}
        <br />
        ตอนนี้ยังไม่มีใครดาวน์โหลดไฟล์ได้
      </span>
    </p>
  );

  // UX audit P1-8: the same facts as before, in plain Thai, as questions.
  const membership = (
    <section className={styles.membership} aria-labelledby="membership-h">
      <h2 id="membership-h">คำถามเรื่องบัญชี</h2>
      <Accordion type="multiple" className={styles.faq}>
        <AccordionItem value="no-login">
          <AccordionTrigger>ไม่เข้าสู่ระบบใช้อะไรได้บ้าง</AccordionTrigger>
          <AccordionContent forceMount>อ่านคลังคลิปและบทความได้ทั้งหมด แต่ยังดาวน์โหลดไฟล์ไม่ได้</AccordionContent>
        </AccordionItem>
        <AccordionItem value="login">
          <AccordionTrigger>เข้าสู่ระบบแล้วได้อะไร</AccordionTrigger>
          <AccordionContent forceMount>
            เรารู้แค่ว่าคุณเป็นเจ้าของบัญชีนั้น (Google ให้อีเมลที่ยืนยันแล้ว ส่วน LINE ไม่ให้อีเมล)
            ให้ดาวและคอมเมนต์ได้ และซื้อแพ็กเกจโซเชียลได้ แต่ยังไม่ใช่สมาชิกที่ได้รับอนุมัติ และไม่ได้เข้าคิวรออนุมัติ
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="two-accounts">
          <AccordionTrigger>ใช้ทั้ง Google และ LINE ได้ไหม</AccordionTrigger>
          <AccordionContent forceMount>
            {settingsAvailable
              ? "ได้ แต่ระบบไม่รวมให้เอง ถ้าอยากให้เป็นบัญชีเดียวกัน เชื่อมได้ที่หน้าตั้งค่าการเข้าสู่ระบบ โดยยืนยันทั้งสองบัญชี"
              : "ได้ แต่จะถือเป็นคนละบัญชี ระบบไม่รวมบัญชีให้"}
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="approved">
          <AccordionTrigger>สมาชิกที่ได้รับอนุมัติคืออะไร</AccordionTrigger>
          <AccordionContent forceMount>
            ยังไม่เปิด เราต้องทำระบบอนุมัติและเคลียร์สิทธิ์ไฟล์ให้เสร็จก่อน สิทธิ์ผู้ดูแลแยกจากสมาชิก และไม่มีปุ่มอนุมัติในเบราว์เซอร์
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <p>
        ดูว่าเราเก็บข้อมูลอะไรบ้างที่ <Link href="/privacy">นโยบายข้อมูล</Link>
      </p>
    </section>
  );

  if (view.state !== "signed-in") {
    // ---------- sign-in screen ----------
    return (
      <main id="main" className={styles.page}>
        <div className={styles.signInGrid}>
          {/* Phones (UX audit P0-5): headline → sign-in card → details, so the
              buttons are above the fold. Desktop keeps two columns. */}
          <div className={styles.pitchHead}>
            <PageHero
              eyebrow="พื้นที่สมาชิก"
              title="เข้าสู่ระบบ kubcode"
              accent="ทำคลิปและดูแลช่องในที่เดียว"
              lead="ใช้บัญชี Google หรือ LINE ที่มีอยู่ ไม่ต้องสร้างรหัสผ่านใหม่"
            />
          </div>
          <section className={styles.card} aria-labelledby="signin-h">
            <h2 id="signin-h" className={styles.cardTitle}>
              เข้าสู่ระบบ
            </h2>
            <p className={styles.cardLead}>
              ใช้ยืนยันว่าเป็นคุณ ให้ดาว คอมเมนต์ และซื้อแพ็กเกจได้
            </p>
            <AccountForm {...formProps} />
            {setupNotice}
            <p className={styles.legal}>
              การเข้าสู่ระบบถือว่ายอมรับ <Link href="/terms">ข้อกำหนดการใช้งาน</Link> และ{" "}
              <Link href="/privacy">นโยบายข้อมูล</Link>
            </p>
          </section>
          <div className={styles.pitchMore}>
            <ul className={styles.families}>
              <li>
                <IconTile tone="studio" size={44}>
                  <Clapperboard />
                </IconTile>
                <div>
                  <FamilyChip family="studio">
                    <Clapperboard aria-hidden="true" /> kubcode Studio
                  </FamilyChip>
                  <p>ทำคลิปด้วย skill กับ AI agent ในคอมคุณเอง</p>
                </div>
              </li>
              <li>
                <IconTile tone="social" size={44}>
                  <MessagesSquare />
                </IconTile>
                <div>
                  <FamilyChip family="social">
                    <MessagesSquare aria-hidden="true" /> kubcode Social
                  </FamilyChip>
                  <p className={styles.platformLine}>
                    ตั้งเวลาโพสต์และตอบคอมเมนต์
                    {(["youtube", "instagram", "tiktok"] as const).map((p) => (
                      <PlatformLogo key={p} platform={p} size={16} />
                    ))}
                  </p>
                </div>
              </li>
            </ul>
            <h2 className={styles.h3}>เข้าสู่ระบบแล้วได้อะไร</h2>
            <ul className={styles.after}>
              {AFTER_SIGN_IN.map(({ icon: Icon, text }) => (
                <li key={text}>
                  <Icon aria-hidden="true" />
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </div>
        {membership}
      </main>
    );
  }

  // ---------- signed-in dashboard (owner, 2026-11-16) ----------
  // Reads as an account page at first glance: who you are and your plan at
  // the top, then your channels and latest posts, with the next actions.
  const ready = billing?.state === "ready" ? billing.view : null;
  const standing = ready ? STANDING[ready.standing] : null;
  const list = channels?.state === "ready" ? channels.channels.filter((c) => c.status !== "disconnected") : null;
  const posts = caps?.publishing ? await getPostsView(process.env, () => cookies()) : null;
  const recent = posts?.state === "ready" ? posts.posts.slice(0, 3) : null;
  const user = view.user;
  const display = user.name?.trim() || (user.email ? user.email.split("@")[0] : "สมาชิก");
  const showTikTok = Boolean(process.env.TIKTOK_SANDBOX_BRIDGE && process.env.TIKTOK_SANDBOX_ORIGIN);
  const activeChannels = list?.filter((c) => c.status === "active").length ?? 0;
  const reconnect = list?.filter((c) => c.status === "needs_reconnect").length ?? 0;
  return (
    <main id="main" className={styles.page}>
      <header className={styles.dashHead}>
        <span className={styles.bigAvatar} aria-hidden="true">
          {view.picture ? (
            // Plain <img>: provider host only (safeAvatarUrl), no proxy, no referrer.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={view.picture} alt="" width={72} height={72} referrerPolicy="no-referrer" decoding="async" />
          ) : (
            avatarInitial(user.name ?? user.email)
          )}
        </span>
        <div className={styles.dashWho}>
          <p className={styles.dashEyebrow}>บัญชีของคุณ</p>
          <h1 className={styles.dashTitle}>สวัสดี {display}</h1>
          <p className={styles.dashMeta}>
            {standing && <Badge variant={standing.variant}>{standing.label}</Badge>}
            {ready?.paidUntil && ready.standing !== "exempt" && <span>ต่ออายุก่อน {thaiDateTime(ready.paidUntil)}</span>}
            <span>เข้าสู่ระบบด้วย {user.provider === "line" ? "LINE" : "Google"}</span>
          </p>
        </div>
        {caps?.publishing && (
          <div className={styles.dashActions}>
            <Button asChild size="lg" className={`rounded-full font-semibold ${styles.primary}`}>
              <Link href="/account/posts/new">
                <Plus aria-hidden="true" /> สร้างโพสต์
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link href="/account/channels">เชื่อมช่อง</Link>
            </Button>
          </div>
        )}
      </header>
      {ready && <BillingBanner view={ready} />}
      {caps && <Onboarding />}

      {caps?.publishing && list && (
        <ul className={styles.stats} aria-label="ภาพรวม">
          <li>
            <span className={styles.statNum}>{activeChannels}</span>
            <span className={styles.statLabel}>ช่องที่ใช้งานได้</span>
          </li>
          <li>
            <span className={styles.statNum}>{recent?.reduce((n, p) => n + p.deliveries.filter((d) => d.status === "scheduled").length, 0) ?? 0}</span>
            <span className={styles.statLabel}>โพสต์ที่ตั้งเวลาไว้</span>
          </li>
          <li>
            <span className={styles.statNum}>{recent?.reduce((n, p) => n + p.deliveries.filter((d) => d.status === "published").length, 0) ?? 0}</span>
            <span className={styles.statLabel}>เผยแพร่แล้ว (ล่าสุด)</span>
          </li>
          {ready && ready.standing !== "exempt" && (
            <li>
              <span className={styles.statNum}>{ready.slots}</span>
              <span className={styles.statLabel}>ช่องที่จ่ายแล้ว</span>
            </li>
          )}
        </ul>
      )}

      <div className={styles.dashGrid}>
        <div className={styles.dashMain}>
          {list && (
            <section className={styles.card} aria-labelledby="channels-h">
              <div className={styles.cardHead}>
                <h2 id="channels-h" className={styles.cardTitle}>
                  ช่องของคุณ
                </h2>
                {reconnect > 0 && <Badge variant="warn">ต้องเชื่อมใหม่ {reconnect}</Badge>}
                <Link className={styles.headLink} href="/account/channels">
                  จัดการ <ChevronRight aria-hidden="true" />
                </Link>
              </div>
              {list.length === 0 ? (
                <p className={styles.muted}>ยังไม่ได้เชื่อมช่อง</p>
              ) : (
                <ul className={styles.channels}>
                  {list.map((c) => (
                    <li key={c.id}>
                      {isPlatform(c.platform) ? <PlatformLogo platform={c.platform} size={20} /> : null}
                      <span className={styles.channelName}>{c.handle ? `@${c.handle}` : c.displayName}</span>
                      <Badge variant={c.status === "active" ? "ok" : "warn"}>{CHANNEL_STATUS[c.status] ?? c.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {recent && (
            <section className={styles.card} aria-labelledby="recent-h">
              <div className={styles.cardHead}>
                <h2 id="recent-h" className={styles.cardTitle}>
                  โพสต์ล่าสุด
                </h2>
                <Link className={styles.headLink} href="/account/posts">
                  ดูทั้งหมด <ChevronRight aria-hidden="true" />
                </Link>
              </div>
              {recent.length === 0 ? (
                <p className={styles.muted}>ยังไม่มีโพสต์</p>
              ) : (
                <ul className={styles.recent}>
                  {recent.map((p) => (
                    <li key={p.id}>
                      <span className={styles.recentLogos} aria-hidden="true">
                        {Array.from(new Set(p.deliveries.map((d) => d.platform)))
                          .filter(isPlatform)
                          .map((pl) => (
                            <PlatformLogo key={pl} platform={pl} size={16} decorative />
                          ))}
                      </span>
                      <span className={styles.recentText}>{p.caption.split("\n")[0] || "(ไม่มีแคปชัน)"}</span>
                      <span className={styles.recentStatus}>
                        {summarize(p.deliveries.map((d) => d.status)).map((x) => (
                          <Badge key={x.label} variant={x.variant}>
                            {x.label}
                          </Badge>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {caps && <AccountShortcuts caps={caps} />}
        </div>

        <aside className={styles.dashSide} aria-label="บัญชีและแพ็กเกจ">
          <section className={styles.card} aria-labelledby="plan-h">
            <div className={styles.cardHead}>
              <h2 id="plan-h" className={styles.cardTitle}>
                แพ็กเกจ
              </h2>
            </div>
            {ready && standing ? (
              <>
                <p className={styles.row}>
                  <Badge variant={standing.variant}>{standing.label}</Badge>
                  {ready.standing !== "exempt" && ready.slots > 0 && <span>{ready.slots} ช่อง</span>}
                </p>
                {ready.paidUntil && ready.standing !== "exempt" && <p className={styles.muted}>ใช้ได้ถึง {thaiDateTime(ready.paidUntil)}</p>}
                <Link className={styles.more} href="/account/billing">
                  การชำระเงินและแพ็กเกจ <ArrowRight aria-hidden="true" />
                </Link>
              </>
            ) : (
              <>
                <p className={styles.muted}>ดูแพ็กเกจและราคาได้ที่หน้าราคา</p>
                <Link className={styles.more} href="/pricing">
                  ดูราคา <ArrowRight aria-hidden="true" />
                </Link>
              </>
            )}
          </section>
          <section className={`${styles.card} ${styles.identityCard}`} aria-label="บัญชีที่เข้าสู่ระบบ">
            <AccountForm {...formProps} />
            {setupNotice}
          </section>
          <nav className={`${styles.card} ${styles.quick}`} aria-labelledby="quick-h">
            <h2 id="quick-h" className={styles.cardTitle}>
              ไปที่
            </h2>
            <ul>
              {settingsAvailable && (
                <li>
                  <Link href="/account/settings">
                    <KeyRound aria-hidden="true" /> ตั้งค่าการเข้าสู่ระบบ
                  </Link>
                </li>
              )}
              {showTikTok && (
                <li>
                  <Link href="/account/tiktok">
                    <PlatformLogo platform="tiktok" size={16} decorative /> โพสต์คลิปบน TikTok
                  </Link>
                </li>
              )}
              <li>
                <Link href="/pricing">
                  <CreditCard aria-hidden="true" /> ราคา
                </Link>
              </li>
              <li>
                <Link href="/">
                  <Clapperboard aria-hidden="true" /> คลังคลิปและ skill
                </Link>
              </li>
            </ul>
          </nav>
        </aside>
      </div>
      {membership}
    </main>
  );
}
