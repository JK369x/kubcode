import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * kubcode Input (MASTER.md §Inputs): `--input` outline (≥3:1, never
 * `--border`), radius 12, 44px tall, 16px text on mobile so iOS does not zoom,
 * 15px from `md` up, 3px `--ring` focus outline.
 */
const fieldClass =
  "w-full min-w-0 rounded-md border border-input bg-card px-3.5 text-base leading-[1.6] text-foreground caret-ring transition-colors outline-none placeholder:text-muted-foreground placeholder:opacity-100 focus-visible:border-ring focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-4 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive md:text-[15px] motion-reduce:transition-none"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldClass,
        "h-11 py-2 file:mr-3 file:inline-flex file:h-8 file:rounded-sm file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-medium file:text-secondary-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Input, fieldClass }
