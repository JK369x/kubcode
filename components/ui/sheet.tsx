"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Dialog as SheetPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

/** Scrim: 50% black keeps the sheet's text >= 4.5:1 over any page (MASTER.md §Modals). */
function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-open:animate-in data-open:fade-in-0 data-open:duration-200 data-closed:animate-out data-closed:fade-out-0 data-closed:duration-150",
        className
      )}
      {...props}
    />
  )
}

/**
 * kubcode Sheet. Radix Dialog: traps focus, Esc closes, focus returns to the
 * trigger. Bottom sheets (mobile comments) are capped at 720px wide and
 * min(85dvh, 760px) tall with a 20px top radius; side sheets are 3/4 wide.
 * Enter 260ms / exit 160ms with the brand ease; reduced motion: none
 * (the global rule in globals.css also stops it).
 */
function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  closeLabel = "ปิด",
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
  /** Accessible name of the close button (Thai). */
  closeLabel?: string
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col bg-popover text-popover-foreground shadow-popover outline-none ease-brand data-open:animate-in data-open:duration-260 data-closed:animate-out data-closed:duration-160 motion-reduce:animate-none",
          "data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:mx-auto data-[side=bottom]:h-[min(85dvh,760px)] data-[side=bottom]:w-full data-[side=bottom]:max-w-[720px] data-[side=bottom]:rounded-t-[20px] data-[side=bottom]:border data-[side=bottom]:border-b-0 data-[side=bottom]:border-input data-[side=bottom]:pb-[env(safe-area-inset-bottom)] data-[side=bottom]:data-open:slide-in-from-bottom data-[side=bottom]:data-closed:slide-out-to-bottom",
          "data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:border-input data-[side=right]:sm:max-w-sm data-[side=right]:data-open:slide-in-from-right data-[side=right]:data-closed:slide-out-to-right",
          "data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:border-input data-[side=left]:sm:max-w-sm data-[side=left]:data-open:slide-in-from-left data-[side=left]:data-closed:slide-out-to-left",
          "data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:border-b data-[side=top]:border-input data-[side=top]:data-open:slide-in-from-top data-[side=top]:data-closed:slide-out-to-top",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button variant="ghost" size="icon" className="absolute top-2 right-2 z-10 rounded-full" aria-label={closeLabel}>
              <XIcon size={20} aria-hidden="true" />
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-lg leading-[1.4] font-semibold text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
