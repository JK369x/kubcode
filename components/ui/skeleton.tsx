import { cn } from "@/lib/utils"

/**
 * kubcode Skeleton: the same shimmer as `.img-skeleton` / `.skeleton-line`
 * (globals.css, 1.4s), still under reduced motion. Decorative: pair it with one
 * `role="status"` label for the whole loading region.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("skeleton-line rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
