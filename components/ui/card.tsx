import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * kubcode Card (MASTER.md §Cards).
 * - `panel`: bg-card, radius 22, padding 20; `border-input` because the edge
 *   carries meaning (tool card), `border-border` with `edge="soft"`.
 * - `cover`: no box, for article cards whose 16:9 cover is the shape.
 * - `media`: the dark 9:16 media object (same in both themes).
 * Cards whose title link stretches over them get one visible ring when that
 * link has keyboard focus (`has-[a[data-stretch]:focus-visible]`).
 */
const cardVariants = cva(
  "group/card relative flex flex-col text-card-foreground has-[[data-stretch]:focus-visible]:outline-3 has-[[data-stretch]:focus-visible]:outline-solid has-[[data-stretch]:focus-visible]:outline-offset-4 has-[[data-stretch]:focus-visible]:outline-ring",
  {
    variants: {
      variant: {
        panel:
          "gap-4 rounded-2xl border border-input bg-card p-5 transition-colors duration-200 ease-brand hover:border-ring motion-reduce:transition-none",
        cover: "gap-3.5 rounded-xl",
        media: "overflow-hidden rounded-2xl bg-[#0c0b10] text-white",
      },
      edge: {
        strong: "",
        soft: "border-border",
      },
    },
    defaultVariants: { variant: "panel", edge: "strong" },
  }
)

function Card({
  className,
  variant,
  edge,
  as = "div",
  ...props
}: React.HTMLAttributes<HTMLElement> & VariantProps<typeof cardVariants> & { as?: "article" | "li" | "div" }) {
  return React.createElement(as, {
    "data-slot": "card",
    "data-variant": variant ?? "panel",
    className: cn(cardVariants({ variant, edge }), className),
    ...props,
  })
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex items-center gap-4", className)} {...props} />
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("font-heading text-lg leading-[1.4] font-semibold tracking-[-0.02em]", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p data-slot="card-description" className={cn("m-0 text-sm leading-[1.75] text-muted-foreground", className)} {...props} />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("grid gap-1.5", className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("mt-auto flex items-end gap-3.5 border-t border-border pt-3.5 text-[13px] text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, cardVariants }
