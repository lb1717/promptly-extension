export function AppleOsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.365 1.43c0 1.14-.493 2.241-1.332 3.023-.86.804-2.273 1.426-3.433 1.337-.153-1.095.466-2.276 1.256-3.023.84-.796 2.347-1.387 3.509-1.337ZM20.25 17.13c-.585 1.353-.866 1.962-1.617 3.16-1.05 1.692-2.533 3.803-4.368 3.822-1.624.017-2.045-1.053-4.265-1.053-2.22 0-2.683 1.036-4.255 1.07-1.716.034-3.022-1.847-4.073-3.534-2.786-4.508-3.083-9.805-1.362-12.612 1.232-1.998 3.181-3.17 5.005-3.17 1.862 0 3.035 1.053 4.573 1.053 1.507 0 2.426-1.053 4.593-1.053 1.647 0 3.388.898 4.62 2.453-4.065 2.206-3.405 7.945.55 9.814Z"
      />
    </svg>
  );
}

export function WindowsOsIcon({ className }: { className?: string }) {
  return (
    <img
      src="/images/os-windows-logo.svg"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className}
    />
  );
}
