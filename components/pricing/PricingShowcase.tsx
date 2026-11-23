"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
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
  ArrowRight,
  Map,
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

/**
 * Price count-up (owner 2026-11-17): the number runs from its previous value
 * (0 on load) to the target in ~0.7 s. Server HTML and screen readers get the
 * final text; reduced motion shows it at once.
 */
function CountUp({ value, text }: { value: number; text: string }) {
  const [shown, setShown] = useState<number | null>(null);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = value;
      setShown(null);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 700);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + (value - a) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
      else {
        from.current = value;
        setShown(null);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  if (shown === null) return <>{text}</>;
  const live = text.replace(/[\d,]+/, shown.toLocaleString("en-US"));
  return (
    <>
      <span aria-hidden="true">{live}</span>
      <span className="sr-only">{text}</span>
    </>
  );
}

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
      <>
        <Button asChild size="lg" className={cn("w-full rounded-full font-semibold", styles.cta)}>
          <Link href="/account/billing">สมัคร{plan.nameTh}</Link>
        </Button>
        {/* UX audit P2-2: the reassurance at the point of decision. */}
        <p className="m-0 text-center text-[13px] leading-[1.6] text-muted-foreground">ยกเลิกได้ทุกเมื่อ · ไม่ตัดเงินอัตโนมัติ</p>
      </>
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
      <span className={styles.calcTotal}>
        <b>
          <CountUp value={total} text={thb(total)} />
        </b>{" "}
        ต่อเดือน
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

function PlanCard({ plan, open, filter, step }: { plan: Plan; open: boolean; filter: Filter; step: number }) {
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
      style={{ "--step": step } as CSSProperties}
    >
      {plan.highlighted && (
        <span className={styles.ribbon}>
          <Sparkles aria-hidden="true" /> แนะนำ
        </span>
      )}
      <CardHeader className="flex-row items-start gap-3">
        <span className={cn(styles.planIcon, "shrink-0")} data-family={plan.families[0] ?? "free"} aria-hidden="true">
          <Icon />
        </span>
        <div className="grid min-w-0 gap-1.5">
          <h2 id={titleId} className="m-0 text-[20px] leading-[1.3] font-semibold">
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
        <span className={styles.amount}>
          <CountUp value={plan.priceThb} text={price.amount} />
        </span>{" "}
        <span className={styles.unit}>{price.unit}</span>
        {extra && <span className={styles.extra}>{extra}</span>}
      </div>
      {isSocial && (
        <ul className={styles.platforms} aria-label="แพลตฟอร์มที่เชื่อมได้">
          {(["youtube", "instagram", "tiktok", "facebook"] as const).map((p) => (
            <li key={p}>
              <PlatformLogo platform={p} size={18} />
            </li>
          ))}
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
  // Phones (one column, ≤680px): recommended plan first. Server render keeps
  // the data order; the client switches after hydration, before most users scroll.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 680px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("for");
    if (f === "studio" || f === "social") setFilter(f);
  }, []);
  const gridRef = useRef<HTMLUListElement>(null);
  const choose = (f: Filter) => {
    setFilter(f);
    // Owner 2026-11-17: picking a family brings its cards to the middle of the
    // screen (after the remount) and replays their entrance.
    requestAnimationFrame(() => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      gridRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    });
    const url = new URL(window.location.href);
    if (f === "all") url.searchParams.delete("for");
    else url.searchParams.set("for", f);
    window.history.replaceState(window.history.state, "", url);
  };
  return (
    <div className={styles.stage} data-filter={filter}>
      <div className={styles.aura} aria-hidden="true" />
      <header className={styles.hero}>
        <Link href="/roadmap" className={styles.roadmapPill}>
          <Map aria-hidden="true" />
          <span>ดูแผนที่จะมา</span>
          <ArrowRight aria-hidden="true" />
        </Link>
        <h1 className={styles.title}>
          เริ่มฟรี <span className={styles.titleAccent}>จ่ายเฉพาะส่วนที่ใช้</span>
        </h1>
        <p className={styles.lead}>skill ทำคลิปใช้ฟรี · ให้ kubcode โพสต์และตอบคอมเมนต์ จ่ายตามช่อง ทีละเดือน ไม่ตัดเงินอัตโนมัติ</p>
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
              <b>Studio</b>
              <span className={styles.tabLong}> · ทำคลิป</span>
            </span>
          </ToggleGroupItem>
          <ToggleGroupItem value="social" className={styles.tab} data-family="social">
            <MessagesSquare aria-hidden="true" />
            <span>
              <b>Social</b>
              <span className={styles.tabLong}> · โพสต์และตอบคอมเมนต์</span>
            </span>
          </ToggleGroupItem>
        </ToggleGroup>
      </header>

      <WaitlistProvider>
        <ul key={filter} ref={gridRef} className={styles.grid} aria-label="แพ็กเกจ" style={{ "--plans": PLANS.length } as CSSProperties}>
          {/* UX audit P1-3: on phones the recommended plan comes first, in
              DOM order too (reading order matches what is seen). */}
          {(() => {
            const order = narrow ? PLANS.toSorted((a, b) => Number(b.highlighted) - Number(a.highlighted)) : PLANS;
            let shown = 0;
            return order.map((p) => (
              <PlanCard key={p.id} plan={p} open={open} filter={filter} step={inFamily(p, filter) ? shown++ : 0} />
            ));
          })()}
        </ul>
      </WaitlistProvider>
      <p className={styles.terms}>ทุกแพ็กเกจจ่ายทีละเดือน ไม่ตัดเงินอัตโนมัติ · ราคานี้ยังไม่มี VAT</p>
    </div>
  );
}
