export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`skeleton-pulse rounded-lg ${className}`}
      style={{ background: "var(--bg-tertiary)", ...style }}
    />
  );
}
