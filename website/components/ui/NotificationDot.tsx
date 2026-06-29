export function NotificationDot({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-2 w-2 shrink-0 rounded-full bg-red-500 ring-2 ring-page ${className}`.trim()}
    />
  );
}
