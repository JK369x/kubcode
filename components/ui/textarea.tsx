import * as React from "react"
import { cn } from "@/lib/utils"
import { fieldClass } from "./input"

/** kubcode Textarea: same box and focus as Input, body line-height 1.7 for Thai. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldClass, "block min-h-11 resize-y py-2.5 leading-[1.7]", className)}
      {...props}
    />
  )
}

export { Textarea }
