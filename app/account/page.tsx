import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Clapperboard,
  CreditCard,
  Download,
  KeyRound,
  MessageSquareReply,
  MessagesSquare,
  Plug,
  Star,
} from "lucide-react";
import { AccountForm } from "@/components/AccountForm";
import { AccountShortcuts } from "@/components/AccountShortcuts";
import { BillingBanner } from "@/components/BillingBanner";
import { capabilitiesFromCookies } from "@/lib/account-nav/capabilities";
import { PlatformLogo, type Platform } from "@/components/PlatformLogo";
import { FamilyChip, IconTile, PageHero } from "@/components/site/PageHero";
import { Badge } from "@/components/ui/badge";
import { getBillingPage, thaiDateTime } from "@/lib/billing/view";
import { getChannelsView } from "@/lib/channels/view";
import { getAccountView } from "@/lib/auth";
import { SESSION_COOKIE_NAME, authErrorMessage, canonicalHostRedirect, safeNext, readAuthConfig } from "@/lib/auth-policy";
import { accountsEnabled } from "@/lib/accounts/view";
import styles from "./account.module.css";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Same wording as /account/billing.
const STANDING: Record<string, { label: string; variant: "ok" | "warn" | "secondary" }> = {
  active: { label: "ใช้งานอยู่", variant: "ok" },
  grace: { label: "หมดอายุ · ช่วงผ่อนผัน 3 วัน", variant: "warn" },
  lapsed: { label: "หมดอายุ · ช่องถูกพัก", variant: "warn" },
  none: { label: "ยังไม่มีแพ็กเกจ", variant: "secondary" },
  exempt: { label: "บัญชีเจ้าของเว็บ (ไม่ต้องชำระ)", variant: "ok" },
};
// Same wording as /account/channels.
const CHANNEL_STATUS: Record<string, string> = {
  active: "เชื่อมอยู่",
  needs_reconnect: "ต้องเชื่อมใหม่",
  disconnected: "ยกเลิกการเชื่อมแล้ว",
};
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
          ? "บัญชีกลางบันทึกเฉพาะวิธีเข้าสู่ระบบที่เชื่อมไว้ ระบบอนุมัติสมาชิกยังไม่พร้อม"
          : "ระบบอนุมัติสมาชิกยังไม่พร้อม ยังไม่มีการบันทึกบัญชีสมาชิกในฐานข้อมูล"}
        <br />
        ดาวน์โหลดยังปิดอยู่สำหรับทุกคน
      </span>
    </p>
  );

  const membership = (
    <section className={styles.membership} aria-labelledby="membership-h">
      <h2 id="membership-h">สถานะที่ต้องแยกกัน</h2>
      <dl>
        <div>
          <dt>ยังไม่เข้าสู่ระบบ</dt>
          <dd>อ่านคลังและบทความได้ แต่ยังดาวน์โหลดไม่ได้</dd>
        </div>
        <div>
          <dt>เข้าสู่ระบบด้วย Google หรือ LINE แล้ว</dt>
          <dd>
            ยืนยันได้แค่ว่าเป็นเจ้าของบัญชีนั้น (Google ยืนยันอีเมล ส่วน LINE ไม่ได้ให้อีเมล)
            ไม่ใช่สมาชิกที่ได้รับอนุมัติ และยังไม่ถูกเพิ่มเข้าคิวรออนุมัติใด ๆ
            {settingsAvailable
              ? "บัญชี Google และ LINE ไม่ถูกรวมให้อัตโนมัติ เชื่อมได้เองที่หน้าตั้งค่าการเข้าสู่ระบบหลังยืนยันทั้งสองฝั่ง"
              : "บัญชี Google และ LINE ถือเป็นคนละบัญชี ระบบไม่รวมบัญชีให้"}
          </dd>
        </div>
        <div>
          <dt>สมาชิกที่ได้รับอนุมัติ</dt>
          <dd>ยังไม่เปิด — ต้องมีระบบอนุมัติและไฟล์ที่เคลียร์สิทธิ์ก่อน</dd>
        </div>
      </dl>
      <p>
        สิทธิ์ผู้ดูแลแยกจากสมาชิก ไม่มีสวิตช์อนุมัติในเบราว์เซอร์ · <Link href="/privacy">นโยบายข้อมูล</Link>
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
              เข้าสู่ระบบเพื่อยืนยันตัวตน ยังไม่ใช่การเป็นสมาชิกหรือสิทธิ์ดาวน์โหลด
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

  // ---------- signed-in overview ----------
  const ready = billing?.state === "ready" ? billing.view : null;
  const standing = ready ? STANDING[ready.standing] : null;
  const list = channels?.state === "ready" ? channels.channels.filter((c) => c.status !== "disconnected") : null;
  const showTikTok = Boolean(process.env.TIKTOK_SANDBOX_BRIDGE && process.env.TIKTOK_SANDBOX_ORIGIN);
  return (
    <main id="main" className={styles.page}>
      <PageHero eyebrow="พื้นที่สมาชิก" title="บัญชีของคุณ" accent="ภาพรวมทั้งหมดในหน้าเดียว" />
      {ready && <BillingBanner view={ready} />}
      {caps && <AccountShortcuts caps={caps} />}
      <div className={styles.dash}>
        <section className={`${styles.card} ${styles.identityCard}`} aria-label="บัญชีที่เข้าสู่ระบบ">
          <AccountForm {...formProps} />
          {setupNotice}
        </section>

        <section className={styles.card} aria-labelledby="plan-h">
          <div className={styles.cardHead}>
            <IconTile tone="social" size={40}>
              <CreditCard />
            </IconTile>
            <h2 id="plan-h" className={styles.cardTitle}>
              แพ็กเกจและการชำระเงิน
            </h2>
          </div>
          {ready && standing ? (
            <>
              <p className={styles.row}>
                <Badge variant={standing.variant}>{standing.label}</Badge>
                {ready.standing !== "exempt" && ready.slots > 0 && <span>{ready.slots} ช่อง</span>}
              </p>
              {ready.paidUntil && ready.standing !== "exempt" && (
                <p className={styles.muted}>ใช้ได้ถึง {thaiDateTime(ready.paidUntil)}</p>
              )}
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

        {list && (
          <section className={styles.card} aria-labelledby="channels-h">
            <div className={styles.cardHead}>
              <IconTile tone="social" size={40}>
                <CalendarClock />
              </IconTile>
              <h2 id="channels-h" className={styles.cardTitle}>
                ช่องที่เชื่อม
              </h2>
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
            <div className={styles.links}>
              <Link className={styles.more} href="/account/channels">
                จัดการช่อง <ArrowRight aria-hidden="true" />
              </Link>
              <span className={styles.hint}>
                <MessageSquareReply aria-hidden="true" /> ตั้งการตอบคอมเมนต์อัตโนมัติได้ที่แต่ละช่อง
              </span>
            </div>
          </section>
        )}

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
      </div>
      {membership}
    </main>
  );
}
