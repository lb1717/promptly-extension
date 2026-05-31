"use client";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-page font-mono text-ink antialiased">
        <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-3 max-w-md text-center text-sm text-neutral-600">
            {error.message || "An unexpected error occurred."}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-6 rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
