"use client";

import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type EngineeringResponse = {
  ok?: boolean;
  user_content_token?: string;
  rewrite_auto_template?: string;
  rewrite_manual_template?: string;
  compose_template?: string;
  error?: string;
};

export function AdminPromptEngineeringClient() {
  const [token, setToken] = useState("<<PROMPTLY_USER_CONTENT>>");
  const [autoT, setAutoT] = useState("");
  const [manualT, setManualT] = useState("");
  const [composeT, setComposeT] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/prompt-engineering", { cache: "no-store" });
      const data = (await res.json()) as EngineeringResponse;
      if (!res.ok) {
        setError(data.error || "Failed to load");
        return;
      }
      if (data.user_content_token) {
        setToken(data.user_content_token);
      }
      setAutoT(data.rewrite_auto_template || "");
      setManualT(data.rewrite_manual_template || "");
      setComposeT(data.compose_template || "");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/admin/prompt-engineering", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rewrite_auto_template: autoT,
          rewrite_manual_template: manualT,
          compose_template: composeT
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Save failed");
        return;
      }
      setMessage("Saved. The next optimize calls will use these templates (cached ~45s on server).");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Prompt engineering</h1>
          <p className="mt-1 text-sm text-violet-200/70">
            One super-prompt per mode. The provider receives a{" "}
            <span className="font-mono text-violet-100">single user message</span>: the template with{" "}
            <span className="font-mono text-amber-200">{token}</span> replaced by the box text (or the compose
            description). No separate system prompt or extra framing.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin"
            className="rounded-lg border border-violet-500/40 px-3 py-2 text-sm text-violet-200 hover:bg-violet-500/10"
          >
            ← Dashboard
          </Link>
          <AdminLogoutButton />
        </div>
      </div>

      {error ? (
        <div className="mb-6 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="mb-6 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {message}
        </div>
      ) : null}

      {loading ? (
        <p className="text-violet-200/80">Loading…</p>
      ) : (
        <div className="flex flex-col gap-8">
          <section className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-violet-300/90">
              Auto-adjust on send (rewrite)
            </h2>
            <p className="mb-3 text-xs text-violet-200/70">
              Used when the user has Auto on and sends from the chat box (AUTO mode).
            </p>
            <textarea
              value={autoT}
              onChange={(e) => setAutoT(e.target.value)}
              rows={12}
              className="w-full resize-y rounded-xl border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 font-mono text-sm text-violet-50 placeholder:text-violet-400/40"
            />
          </section>

          <section className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-violet-300/90">
              Improve Prompt button (manual rewrite)
            </h2>
            <p className="mb-3 text-xs text-violet-200/70">MANUAL rewrite from the extension popup.</p>
            <textarea
              value={manualT}
              onChange={(e) => setManualT(e.target.value)}
              rows={12}
              className="w-full resize-y rounded-xl border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 font-mono text-sm text-violet-50 placeholder:text-violet-400/40"
            />
          </section>

          <section className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-violet-300/90">
              Generate prompt (compose)
            </h2>
            <p className="mb-3 text-xs text-violet-200/70">
              The description field in the popup; token is replaced with that text.
            </p>
            <textarea
              value={composeT}
              onChange={(e) => setComposeT(e.target.value)}
              rows={12}
              className="w-full resize-y rounded-xl border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 font-mono text-sm text-violet-50 placeholder:text-violet-400/40"
            />
          </section>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save all templates"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
