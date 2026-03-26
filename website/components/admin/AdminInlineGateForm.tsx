"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function AdminInlineGateForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      if (!res.ok) {
        setError("Invalid password.");
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-6xl items-center justify-center px-4 py-12">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-violet-500/25 bg-[#221830]/80 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
      >
        <h1 className="mb-1 text-xl font-semibold text-white">Admin access</h1>
        <p className="mb-6 text-sm text-violet-200/70">Enter the password to open the dashboard.</p>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-violet-300/90">Password</label>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-xl border border-violet-500/30 bg-[#0d081b]/80 px-4 py-3 text-sm text-white outline-none ring-violet-500/40 placeholder:text-slate-500 focus:ring-2"
          placeholder="••••••••"
          required
        />
        {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
        >
          {loading ? "Checking…" : "Unlock dashboard"}
        </button>
      </form>
    </main>
  );
}
