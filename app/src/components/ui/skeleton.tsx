import { cn } from "@/lib/utils"

/* M5/U6: shimmer sweep (translateX + opacity gradient) replaces pulse.
   The sweep lives in the `.shimmer` class in globals.css so the keyframes
   stay in one place; reduced-motion collapses it. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("shimmer rounded-md bg-foreground/10", className)}
      {...props}
    />
  )
}

export { Skeleton }
