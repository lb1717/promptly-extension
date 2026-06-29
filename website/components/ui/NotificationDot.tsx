export function NotificationDot({
  className = "",
  corner = false
}: {
  className?: string;
  corner?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`h-2 w-2 shrink-0 rounded-full bg-red-500 ring-2 ring-page ${
        corner ? "absolute -right-1 -top-1" : "inline-block"
      } ${className}`.trim()}
    />
  );
}
