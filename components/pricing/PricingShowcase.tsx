"use client";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import {
  Check,
  Clapperboard,
  Gift,
  Layers,
  LayoutGrid,
  MessagesSquare,
  Minus,
  Plus,
  Sparkles,
} from "lucide-react";
import { WaitlistButton, WaitlistProvider } from "@/components/WaitlistButton";
import { PlatformLogo } from "@/components/PlatformLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PLANS, PRODUCT_FAMILIES, extraChannelLabel, priceLabel, type Plan, type ProductFamily } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { inFamily, lookOf, monthlyTotal, thb } from "./plan-ui";
import styles from "./PricingShowcase.module.css";

type Filter = ProductFamily | "all";

/** ?for=studio|social filters the plans (Free stays in both). */
const MAX_CHANNELS = 50;

const ICONS = { gift: Gift, messages: MessagesSquare, clapperboard: Clapperboard, layers: Layers } as const;

function FamilyMark({ family }: { family: ProductFamily }) {
  const Icon = family === "studio" ? Clapperboard : MessagesSquare;
  return (
    <span className={styles.family} data-family={family}>
      <Icon aria-hidden="true" />
      {PRODUCT_FAMILIES[family]}
    </span>
  );
}

function PlanCta({ plan, open }: { plan: Plan; open: boolean }) {
  const noteId = `plan-${plan.id}-note`;
  if (plan.status === "coming_soon") {
    return (
      <>
        <WaitlistButton kind="plan" id={plan.id} label={`แพ็กเกจ${plan.nameTh}`} className="h-12 w-full rounded-full" />
        <p className="m-0 text-center text-[13px] leading-[1.6] text-muted-foreground">ยังซื้อไม่ได้ ยังไม่เปิดขาย</p>
      </>
    );
  }
  if (plan.priceThb === 0) {
    return (
      <Button asChild variant="outline" size="lg" className="w-full rounded-full">
        <Link href="/account">เข้าสู่ระบบเพื่อเริ่มใช้</Link>
      </Button>
    );
  }
  if (open) {
    return (
      <Button asChild size="lg" className={cn("w-full rounded-full font-semibold", styles.cta)}>
        <Link href="/account/billing">สมัคร{plan.nameTh}</Link>
      </Button>
    );
  }
  return (
    <>
      <Button disabled size="lg" className="w-full rounded-full" aria-describedby={noteId}>
        เปิดให้สมัครเร็ว ๆ นี้
      </Button>
      <p id={noteId} className="m-0 text-center text-[13px] leading-[1.6] text-muted-foreground">
        ยังไม่เปิดรับชำระเงิน
      </p>
    </>
  );
}

/** Social card: N channels → monthly total. Informational; checkout picks the count itself. */
function ChannelCalculator({ plan }: { plan: Plan }) {
  const [n, setN] = useState(1);
  const total = monthlyTotal(plan, n);
  return (
    <div className={styles.calc} role="group" aria-label="คำนวณราคาตามจำนวนช่อง">
      <span className={styles.calcLabel}>ลองคิดราคา</span>
      <span className={styles.calcTotal}>
        <b>{thb(total)}</b> ต่อเดือน
      </span>
      <div className={styles.stepper}>
        <Button type="button" variant="outline" size="icon-sm" className="rounded-full" aria-label="ลดจำนวนช่อง" disabled={n <= 1} onClick={() => setN((x) => Math.max(1, x - 1))}>
          <Minus aria-hidden="true" />
        </Button>
        <output className={styles.count} aria-live="polite">
          {n} ช่อง
        </output>
        <Button type="button" variant="outline" size="icon-sm" className="rounded-full" aria-label="เพิ่มจำนวนช่อง" disabled={n >= MAX_CHANNELS} onClick={() => setN((x) => Math.min(MAX_CHANNELS, x + 1))}>
          <Plus aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function PlanCard({ plan, open, filter }: { plan: Plan; open: boolean; filter: Filter }) {
  const price = priceLabel(plan);
  const extra = extraChannelLabel(plan);
  const look = lookOf(plan);
  const Icon = ICONS[look.icon];
  const soon = plan.status === "coming_soon";
  const titleId = `plan-${plan.id}`;
  const isSocial = plan.families.includes("social");
  return (
    <Card
      as="li"
      aria-labelledby={titleId}
      data-status={plan.status}
      data-plan={plan.id}
      data-highlighted={plan.highlighted ? "" : undefined}
      hidden={!inFamily(plan, filter)}
      edge={soon ? "soft" : "strong"}
      className={cn(styles.card, soon && styles.soon, plan.highlighted && styles.lifted)}
    >
      {plan.highlighted && (
        <span className={styles.ribbon}>
          <Sparkles aria-hidden="true" /> แนะนำ
        </span>
      )}
      <CardHeader className="flex-col items-start gap-3">
        <span className={styles.planIcon} data-family={plan.families[0] ?? "free"} aria-hidden="true">
          <Icon />
        </span>
        <div className="grid gap-1.5">
          <h2 id={titleId} className="m-0 text-[22px] leading-[1.35] font-semibold">
            {plan.nameTh} <span className="font-brand text-[15px] font-medium text-muted-foreground">{plan.nameEn}</span>
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {plan.families.length === 0 ? (
              <span className={styles.family} data-family="free">
                <LayoutGrid aria-hidden="true" /> ทุกคน
              </span>
            ) : (
              plan.families.map((f) => <FamilyMark key={f} family={f} />)
            )}
            {soon && <Badge variant="warn">เร็ว ๆ นี้</Badge>}
          </div>
        </div>
      </CardHeader>
      <p className={styles.fit}>{look.fitTh}</p>
      <div className={cn(styles.price, soon && styles.priceSoon)}>
        <span className={styles.amount}>{price.amount}</span> <span className={styles.unit}>{price.unit}</span>
        {extra && <span className={styles.extra}>{extra}</span>}
      </div>
      {isSocial && (
        <ul className={styles.platforms} aria-label="แพลตฟอร์มที่เชื่อมได้">
          {(["youtube", "instagram", "tiktok"] as const).map((p) => (
            <li key={p}>
              <PlatformLogo platform={p} size={18} />
            </li>
          ))}
          <li className={styles.fbSoon}>
            <PlatformLogo platform="facebook" size={16} tone="muted" decorative />
            <span>Facebook เร็ว ๆ นี้</span>
          </li>
        </ul>
      )}
      {plan.id === "social" && !soon && <ChannelCalculator plan={plan} />}
      <CardContent className="gap-0">
        <ul className={styles.features}>
          {plan.features.map((f) => {
            const excluded = f.startsWith("ไม่รวม");
            return (
              <li key={f} data-excluded={excluded ? "" : undefined}>
                {excluded ? <Minus aria-hidden="true" /> : <Check aria-hidden="true" />}
                <span>{f}</span>
              </li>
            );
          })}
        </ul>
      </CardContent>
      <CardFooter className="mt-auto flex-col items-stretch gap-2 border-t-0 pt-2">
        <PlanCta plan={plan} open={open} />
      </CardFooter>
    </Card>
  );
}

export function PricingShowcase({ open }: { open: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("for");
    if (f === "studio" || f === "social") setFilter(f);
  }, []);
  const choose = (f: Filter) => {
    setFilter(f);
    const url = new URL(window.location.href);
    if (f === "all") url.searchParams.delete("for");
    else url.searchParams.set("for", f);
    window.history.replaceState(window.history.state, "", url);
  };
  return (
    <div className={styles.stage} data-filter={filter}>
      <div className={styles.aura} aria-hidden="true" />
      <header className={styles.hero}>
        <p className={styles.eyebrow}>ราคา · จ่ายทีละเดือน</p>
        <h1 className={styles.title}>
          เริ่มฟรี <span className={styles.titleAccent}>จ่ายเฉพาะส่วนที่ใช้</span>
        </h1>
        <p className={styles.lead}>
          ทำคลิปด้วย skill ฟรีได้เลย อยากให้ kubcode โพสต์และตอบคอมเมนต์ให้ จ่ายตามจำนวนช่องที่เชื่อม ทีละเดือน ไม่ตัดเงินอัตโนมัติ
        </p>
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(v) => v && choose(v as Filter)}
          aria-label="ดูแพ็กเกจของ"
          className={styles.switch}
        >
          <ToggleGroupItem value="all" className={styles.tab}>
            <LayoutGrid aria-hidden="true" />
            ทั้งหมด
          </ToggleGroupItem>
          <ToggleGroupItem value="studio" className={styles.tab} data-family="studio">
            <Clapperboard aria-hidden="true" />
            <span>
              <b>Studio</b> · ทำคลิป
            </span>
          </ToggleGroupItem>
          <ToggleGroupItem value="social" className={styles.tab} data-family="social">
            <MessagesSquare aria-hidden="true" />
            <span>
              <b>Social</b> · โพสต์และตอบคอมเมนต์
            </span>
          </ToggleGroupItem>
        </ToggleGroup>
      </header>

      <WaitlistProvider>
        <ul className={styles.grid} aria-label="แพ็กเกจ" style={{ "--plans": PLANS.length } as CSSProperties}>
          {PLANS.map((p) => (
            <PlanCard key={p.id} plan={p} open={open} filter={filter} />
          ))}
        </ul>
      </WaitlistProvider>
      <p className={styles.terms}>
        <span>ทุกแพ็กเกจจ่ายทีละเดือน ไม่ตัดเงินอัตโนมัติ · ราคานี้ยังไม่มี VAT</span>
        <Link href="/roadmap" className={styles.roadmap}>
          ดูแผนที่จะมา →
        </Link>
      </p>
    </div>
  );
}
