import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/**
 * kubcode Badge (MASTER.md §Chips / Badges): pill, 12–13px, never colour
 * alone (always a word). `ok` / `warn` are the channel status chips: pale fill
 * + dark text, the same in both themes (6.5 / 6.4:1).
 */
const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full border border-transparent px-2.5 py-0.5 text-[13px] leading-[1.5] font-medium whitespace-nowrap outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring [&>svg]:pointer-events-none [&>svg]:size-3.5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border-input text-foreground [a]:hover:bg-accent",
        destructive: "border-input text-destructive",
        ok: "bg-[#dcfce7] text-[#166534]",
        warn: "bg-[#fef3c7] text-[#92400e]",
        media: "bg-black/70 text-white shadow-[0_2px_8px_rgb(0_0_0/0.35)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
