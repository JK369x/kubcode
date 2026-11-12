import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { fieldClass } from "./input"

/**
 * Native <select> with the Input box (MASTER.md §Inputs). Native on purpose:
 * the platform picker is the most usable control on phones for short lists.
 */
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <span data-slot="native-select-wrap" className="relative block">
      <select
        data-slot="native-select"
        className={cn(fieldClass, "h-11 cursor-pointer appearance-none py-2 pr-10", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </span>
  )
}

export { NativeSelect }
