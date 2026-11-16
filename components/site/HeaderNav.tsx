"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, LayoutGrid, Users, Wrench } from "lucide-react";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { LEARN_LINKS, PRICING_LINK, isCurrent } from "@/lib/main-links";

export const LEARN_ICONS = { "/": LayoutGrid, "/articles": BookOpen, "/tools": Wrench, "/community": Users } as const;

/**
 * Desktop content navigation (owner, 2026-11-16): the four content pages are
 * one topic, so they sit in one "เรียนรู้" menu with a line each; "ราคา"
 * stays top-level. Phones get the same grouping in MobileNav.
 */
export function HeaderNav() {
  const path = usePathname();
  const inLearn = LEARN_LINKS.some((l) => isCurrent(l.href, path));
  return (
    <NavigationMenu className="header-learn">
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger aria-current={inLearn ? "page" : undefined}>เรียนรู้</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="m-0 grid w-[min(560px,90vw)] list-none grid-cols-2 gap-1 p-0">
              {LEARN_LINKS.map((l) => {
                const Icon = LEARN_ICONS[l.href];
                const current = isCurrent(l.href, path);
                return (
                  <li key={l.href}>
                    <NavigationMenuLink asChild active={current}>
                      <Link href={l.href} aria-current={current ? "page" : undefined}>
                        <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[linear-gradient(135deg,#7c3aed,#6d28d9)] text-white" aria-hidden="true">
                          <Icon className="size-5" />
                        </span>
                        <span className="grid min-w-0 gap-0.5">
                          <span className="text-[15px] font-semibold">{l.label}</span>
                          <span className="text-[13px] leading-[1.5] text-muted-foreground">{l.desc}</span>
                        </span>
                      </Link>
                    </NavigationMenuLink>
                  </li>
                );
              })}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink asChild active={isCurrent(PRICING_LINK.href, path)} className={navigationMenuTriggerStyle()}>
            <Link href={PRICING_LINK.href} aria-current={isCurrent(PRICING_LINK.href, path) ? "page" : undefined}>
              {PRICING_LINK.label}
            </Link>
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
