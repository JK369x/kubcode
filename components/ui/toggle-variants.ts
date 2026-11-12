import { cva } from "class-variance-authority"

/**
 * kubcode Toggle / chip (MASTER.md §Chips). `chip` is the filter pill: 13px
 * Thai, 44px tall on mobile and 40px from `md`, the pressed or checked one
 * filled with `--primary`. The same look is exported as `chipVariants` for
 * chips that are links (`aria-current="page"`), so link filters and button
 * filters match.
 */
const toggleVariants = cva(
  "group/toggle relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 border text-[13px] leading-[1.4] font-medium whitespace-nowrap no-underline transition-[background-color,border-color,color] duration-200 ease-brand outline-none select-none focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-4 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "rounded-md border-transparent bg-transparent text-foreground hover:bg-accent data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground",
        outline:
          "rounded-full border-input bg-transparent text-foreground hover:border-ring data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
        chip: "rounded-full border-input bg-transparent text-foreground hover:border-ring data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:font-semibold aria-[current=page]:text-primary-foreground",
      },
      size: {
        default: "h-11 px-4 md:h-10",
        sm: "h-9 px-3 md:h-8 before:absolute before:-inset-y-1 before:inset-x-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/** Filter-chip look for links and buttons outside a ToggleGroup. */
const chipVariants = (opts: { size?: "default" | "sm"; className?: string } = {}) =>
  toggleVariants({ variant: "chip", size: opts.size ?? "default", className: opts.className })

export { toggleVariants, chipVariants }
