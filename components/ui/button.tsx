import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/**
 * kubcode Button (design-system/kubcode/MASTER.md §Buttons).
 * - 15px/500 Anuphan, radius 12 (`rounded-md`), pill for `feature`.
 * - Primary actions are 44px tall on mobile and 40px from `md` up; icon
 *   buttons are 44×44 / 40×40. `sm` is for dense desktop rows only and still
 *   keeps a 24px+ hit area.
 * - Focus: a 3px `--ring` outline 4px out (≥3:1 in both themes), never the
 *   shadcn half-transparent ring.
 */
const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border border-transparent text-[15px] leading-[1.4] font-medium whitespace-nowrap no-underline transition-[background-color,border-color,color,transform] duration-200 ease-brand outline-none select-none focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-4 focus-visible:outline-ring active:not-aria-[haspopup]:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive motion-reduce:transition-none motion-reduce:active:translate-y-0 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:enabled:bg-primary-hover hover:enabled:text-primary-hover-foreground [a]:hover:bg-primary-hover [a]:hover:text-primary-hover-foreground",
        feature:
          "rounded-full bg-primary text-primary-foreground hover:enabled:bg-primary-hover hover:enabled:text-primary-hover-foreground [a]:hover:bg-primary-hover [a]:hover:text-primary-hover-foreground",
        outline:
          "border-input bg-transparent text-foreground hover:enabled:border-ring hover:enabled:bg-accent [a]:hover:border-ring [a]:hover:bg-accent aria-expanded:bg-accent",
        secondary:
          "bg-secondary text-secondary-foreground hover:enabled:bg-accent hover:enabled:text-accent-foreground [a]:hover:bg-accent aria-expanded:bg-accent",
        ghost:
          "bg-transparent text-foreground hover:enabled:bg-accent hover:enabled:text-accent-foreground [a]:hover:bg-accent aria-expanded:bg-accent",
        destructive:
          "border-input bg-transparent text-destructive hover:enabled:border-destructive light:border-destructive light:bg-destructive light:text-destructive-foreground light:hover:enabled:opacity-90",
        link: "h-auto! min-h-6 px-0! text-link underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-[18px] md:h-10",
        sm: "h-9 px-3 text-sm md:h-8 before:absolute before:-inset-y-1 before:inset-x-0",
        lg: "h-12 px-6",
        icon: "size-11 md:size-10",
        "icon-sm":
          "size-9 md:size-8 before:absolute before:-inset-1 [&_svg:not([class*='size-'])]:size-4",
      },
    },
    compoundVariants: [
      { variant: "feature", class: "h-11 pr-4 pl-5 md:h-11" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
