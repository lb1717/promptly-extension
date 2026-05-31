"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-page px-6 py-16 text-ink">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-3 max-w-md text-center text-sm text-muted">
        {error.message || "An unexpected error occurred."}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800"
      >
        Try again
      </button>
    </main>
  );
}
