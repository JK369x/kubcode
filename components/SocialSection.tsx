"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { ArrowRight, CalendarClock, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlatformLogo } from "./PlatformLogo";
import styles from "./SocialSection.module.css";

/**
 * Home: kubcode Social (owner pick 2026-11-13, "phone demo"). The phone is
 * the visitor's own channel and the demo is interactive: type a keyword and a
 * link and the comment and the DM update. Purely local: no network, the text
 * is rendered by React (escaped) and capped in length.
 *
 * Every claim is live today: scheduling to YouTube / Instagram / TikTok
 * (lib/channels/config CONNECTABLE); Instagram keyword → DM and TikTok
 * keyword → public reply (lib/automations AUTOMATION_PLATFORMS). Facebook and
 * the kubcode MCP are marked as not available and never implied working.
 */
export const KEYWORD_MAX = 20;
export const LINK_MAX = 48;

/** One word, like the real rules: no spaces, only what a comment can hold. */
export function cleanKeyword(v: string): string {
  return v.replace(/[\s<>"'`]/gu, "").slice(0, KEYWORD_MAX);
}
/** A short link as people type it; no scheme shown, no spaces or markup. */
export function cleanLink(v: string): string {
  return v
    .replace(/^\s*https?:\/\//iu, "")
    .replace(/[\s<>"'`]/gu, "")
    .slice(0, LINK_MAX);
}

export function SocialSection({ roadmap = false, pricing = false }: { roadmap?: boolean; pricing?: boolean }) {
  const id = useId();
  const [keyword, setKeyword] = useState("ลิงก์");
  const [link, setLink] = useState("yourshop.com/promo");
  const kw = keyword || "ลิงก์";
  const url = link || "yourshop.com/promo";
  return (
    <section className={styles.section} aria-labelledby="social-heading">
      <div className={styles.head}>
        <p className={styles.eyebrow}>kubcode Social</p>
        <h2 id="social-heading" className={styles.title}>
          คลิปเสร็จแล้ว ให้ kubcode โพสต์และตอบคอมเมนต์ให้
        </h2>
        <p className={styles.lead}>
          เชื่อมช่องครั้งเดียว ตั้งเวลาโพสต์ลงทุกแพลตฟอร์มจากที่เดียว แล้วให้ระบบตอบคนที่คอมเมนต์คีย์เวิร์ดที่คุณตั้งไว้
        </p>
      </div>

      <div className={styles.demo}>
        <div className={styles.demoLeft}>
          <div className={styles.phone}>
            <div className={styles.screen}>
              <div className={styles.igBar}>
                <span className={styles.avatar} aria-hidden="true">
                  <UserRound className="size-3.5" />
                </span>
                ช่องของคุณ
                <PlatformLogo platform="instagram" size={16} className="ml-auto" />
              </div>
              <div className={styles.igPost} aria-hidden="true" />
              <div className={styles.igComments}>
                <span>
                  <b>ผู้ติดตาม</b> ขอ<span className={styles.igKey}>{kw}</span>หน่อยครับ
                </span>
                <span className={styles.igSmall}>ระบบส่ง DM ให้แล้ว · เมื่อสักครู่</span>
              </div>
              <div className={styles.igDm}>
                <span className={styles.igSmall}>ข้อความจากช่องของคุณ</span>
                <div className={`${styles.bubbleOut} ${styles.stack}`}>
                  <span>นี่ลิงก์ที่ขอไว้ครับ</span>
                  <span className={styles.link} data-testid="dm-link">
                    {url}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <form className={styles.tryIt} aria-label="ตัวอย่าง ลองเปลี่ยนคีย์เวิร์ดและลิงก์" onSubmit={(e) => e.preventDefault()}>
            <p className={styles.tryLabel}>
              <Badge variant="outline">ตัวอย่าง</Badge> ลองเปลี่ยนดู
            </p>
            <div className={styles.field}>
              <Label htmlFor={`${id}-kw`}>คีย์เวิร์ด</Label>
              <Input
                id={`${id}-kw`}
                value={keyword}
                maxLength={KEYWORD_MAX}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setKeyword(cleanKeyword(e.target.value))}
              />
            </div>
            <div className={styles.field}>
              <Label htmlFor={`${id}-link`}>ลิงก์ของคุณ</Label>
              <Input
                id={`${id}-link`}
                value={link}
                maxLength={LINK_MAX}
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setLink(cleanLink(e.target.value))}
              />
            </div>
            {/* Screen readers hear the result once typing settles. */}
            <p className="sr-only" aria-live="polite">
              {`คนคอมเมนต์ ${kw} จะได้ DM พร้อมลิงก์ ${url}`}
            </p>
          </form>
        </div>

        <ul className={styles.list}>
          <li>
            <CalendarClock className="mt-0.5 size-6 text-link" aria-hidden="true" />
            <div>
              <h3>ตั้งเวลาโพสต์จากที่เดียว</h3>
              <p>YouTube, Instagram และ TikTok ในคิวเดียว</p>
              <div className="mt-2 flex gap-3">
                {(["youtube", "instagram", "tiktok"] as const).map((p) => (
                  <PlatformLogo key={p} platform={p} size={20} />
                ))}
              </div>
            </div>
          </li>
          <li>
            <PlatformLogo platform="instagram" size={24} decorative className="mt-0.5" />
            <div>
              <h3>Instagram: คอมเมนต์คีย์เวิร์ด ได้ DM พร้อมลิงก์</h3>
              <p>คนพิมพ์คำที่คุณตั้งไว้ใต้โพสต์ ระบบส่งลิงก์ให้ทาง DM</p>
            </div>
          </li>
          <li>
            <PlatformLogo platform="tiktok" size={24} decorative className="mt-0.5" />
            <div>
              <h3>TikTok: ตอบคอมเมนต์อัตโนมัติ</h3>
              <p>ตอบใต้คอมเมนต์คีย์เวิร์ดแบบสาธารณะ (TikTok ส่ง DM ไม่ได้)</p>
            </div>
          </li>
        </ul>
      </div>

      <ul className={styles.soon} aria-label="ยังไม่เปิดใช้">
        <li>
          <PlatformLogo platform="facebook" size={18} tone="muted" decorative />
          <span>Facebook</span>
          <Badge variant="outline" className="text-muted-foreground">
            เร็ว ๆ นี้
          </Badge>
        </li>
        <li>
          <span className={styles.mcp} aria-hidden="true">
            MCP
          </span>
          <span>สั่งโพสต์จาก AI agent ของคุณ (kubcode MCP)</span>
          <Badge variant="secondary">กำลังทำ</Badge>
          {roadmap && (
            <Link href="/roadmap" className={styles.roadmap}>
              ดูแผนงาน
            </Link>
          )}
        </li>
      </ul>

      <div className={styles.actions}>
        <Button asChild size="lg" className="rounded-full px-6 text-base font-semibold">
          <Link href="/account/channels">
            เชื่อมช่องของคุณ
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        {/* /pricing ships in #89; the link appears only once that page exists. */}
        {pricing && (
          <Button asChild size="lg" variant="outline" className="rounded-full px-6 text-base">
            <Link href="/pricing">ดูราคา</Link>
          </Button>
        )}
      </div>
      {/* Same wording as the tools page (components/ToolIndex.tsx). */}
      <p className={styles.trademark}>
        YouTube, Instagram, TikTok และ Facebook เป็นเครื่องหมายการค้าของเจ้าของแต่ละราย ใช้โลโก้เพื่อบอกว่าหมายถึงแพลตฟอร์มใดเท่านั้น ไม่ได้แปลว่าเจ้าของรับรองเว็บนี้
      </p>
    </section>
  );
}
