"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, CreditCard, LayoutGrid, Menu, Users, Wrench } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

import { MAIN_LINKS } from "@/lib/main-links";

const ICONS = { "/": LayoutGrid, "/articles": BookOpen, "/tools": Wrench, "/community": Users, "/pricing": CreditCard } as const;

/**
 * Phones (≤560px, UX audit P1-1): one header row of logo + account + this
 * menu button; the five links and the theme switch live in a Sheet. The
 * desktop header keeps its inline links and is unchanged.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  // A link press navigates; close the sheet when the route changes.
  useEffect(() => setOpen(false), [path]);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="mobile-nav-trigger size-11 rounded-full min-[561px]:hidden" aria-label="เมนู">
          <Menu aria-hidden className="size-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(320px,86vw)] gap-0 p-0">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="font-brand text-[22px]">kubcode</SheetTitle>
          <SheetDescription className="sr-only">เมนูหลักของเว็บ</SheetDescription>
        </SheetHeader>
        <nav aria-label="เมนูหลัก" className="grid gap-1 p-3">
          {MAIN_LINKS.map(({ href, label }) => {
            const Icon = ICONS[href];
            const current = href === "/" ? path === "/" : path?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={current ? "page" : undefined}
                className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-[16px] font-medium text-foreground no-underline hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring aria-[current=page]:bg-muted aria-[current=page]:text-link"
              >
                <Icon aria-hidden className="size-5 text-muted-foreground" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex items-center justify-between border-t border-border px-5 py-4 text-[15px]">
          <span className="text-muted-foreground">ธีม</span>
          <ThemeToggle />
        </div>
      </SheetContent>
    </Sheet>
  );
}
