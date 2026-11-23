"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CreditCard, LayoutDashboard, Menu, Plus, Radio, Send, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LEARN_ICONS } from "@/components/site/HeaderNav";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LEARN_LINKS, PRICING_LINK, WORK_LINKS, isCurrent } from "@/lib/main-links";

const WORK_ICONS = { "/account": LayoutDashboard, "/account/posts": Send, "/account/channels": Radio } as const;

const row =
  "flex min-h-12 items-center gap-3 rounded-xl px-3 text-[16px] font-medium text-foreground no-underline hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring aria-[current=page]:bg-muted aria-[current=page]:text-link";

/**
 * Phones (≤560px): one header row of logo + account + this menu button. The
 * sheet mirrors the desktop header (owner, 2026-11-16): your work first when
 * you can publish ("สร้างโพสต์" + แดชบอร์ด · โพสต์ของฉัน · ช่อง), then
 * เรียนรู้ (the four content pages, with a line each), ราคา, and the theme.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [canPublish, setCanPublish] = useState(false);
  const path = usePathname();
  // A link press navigates; close the sheet when the route changes.
  useEffect(() => setOpen(false), [path]);
  // Same source as the header menu; any failure just hides the work section.
  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch("/api/account/capabilities", { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as { publishing?: boolean }) : null))
      .catch(() => null)
      .then((c) => live && setCanPublish(c?.publishing === true));
    return () => {
      live = false;
    };
  }, [open]);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="mobile-nav-trigger size-11 rounded-full min-[561px]:hidden" aria-label="เมนู">
          <Menu aria-hidden className="size-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(340px,88vw)] gap-0 overflow-y-auto p-0">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="font-brand text-[22px]">kubcode</SheetTitle>
          <SheetDescription className="sr-only">เมนูหลักของเว็บ</SheetDescription>
        </SheetHeader>
        <nav aria-label="เมนูหลัก" className="grid gap-4 p-3">
          {canPublish && (
            <section aria-labelledby="sheet-work" className="grid gap-1">
              <h2 id="sheet-work" className="m-0 px-3 pt-1 text-[13px] font-semibold text-muted-foreground">
                งานของคุณ
              </h2>
              <Link
                href="/account/posts/new"
                className="mx-1 my-1 flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#7c3aed] px-4 text-[16px] font-semibold text-white no-underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring [:root[data-theme=light]_&]:bg-[#6d28d9]"
              >
                <Plus aria-hidden className="size-5" /> สร้างโพสต์
              </Link>
              {WORK_LINKS.map(({ href, label }) => {
                const Icon = WORK_ICONS[href];
                return (
                  <Link key={href} href={href} aria-current={isCurrent(href, path) ? "page" : undefined} className={row}>
                    <Icon aria-hidden className="size-5 text-muted-foreground" />
                    {label}
                  </Link>
                );
              })}
            </section>
          )}
          <section aria-labelledby="sheet-learn" className="grid gap-1">
            <h2 id="sheet-learn" className="m-0 px-3 pt-1 text-[13px] font-semibold text-muted-foreground">
              เรียนรู้
            </h2>
            {LEARN_LINKS.map(({ href, label, desc }) => {
              const Icon = LEARN_ICONS[href];
              return (
                <Link key={href} href={href} aria-current={isCurrent(href, path) ? "page" : undefined} className={`${row} py-2`}>
                  <Icon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                  <span className="grid">
                    <span>{label}</span>
                    <span className="text-[13px] font-normal text-muted-foreground">{desc}</span>
                  </span>
                </Link>
              );
            })}
          </section>
          <Link href={PRICING_LINK.href} aria-current={isCurrent(PRICING_LINK.href, path) ? "page" : undefined} className={row}>
            <CreditCard aria-hidden className="size-5 text-muted-foreground" />
            {PRICING_LINK.label}
          </Link>
          <Link href="/roadmap#shipped-h" aria-current={isCurrent("/roadmap", path) ? "page" : undefined} className={row}>
            <Sparkles aria-hidden className="size-5 text-muted-foreground" />
            อัปเดต
          </Link>
        </nav>
        <div className="mt-auto flex items-center justify-between border-t border-border px-5 py-4 text-[15px]">
          <span className="text-muted-foreground">ธีม</span>
          <ThemeToggle variant="row" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
