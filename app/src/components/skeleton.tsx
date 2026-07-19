import { Skeleton as UiSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Thin compat wrapper over ui/skeleton.tsx — keeps the existing `className` +
// `style` export signature so importers don't need touching.
export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <UiSkeleton className={cn(className)} style={style} />;
}
