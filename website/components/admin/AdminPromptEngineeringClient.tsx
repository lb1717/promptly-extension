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
  rewrite_auto_model?: string;
  rewrite_manual_model?: string;
  create_model?: string;
  rewrite_fallback_model?: string;
  create_fallback_model?: string;
  rewrite_timeout_ms?: number;
  create_timeout_ms?: number;
  rewrite_max_completion_tokens?: number;
  rewrite_auto_hard_cap_tokens?: number;
  create_max_completion_tokens?: number;
  create_continuation_max_rounds?: number;
  create_template_max_chars?: number;
  create_user_slot_max_chars?: number;
  error?: string;
};

export function AdminPromptEngineeringClient() {
  const [token, setToken] = useState("<<PROMPTLY_USER_CONTENT>>");
  const [autoT, setAutoT] = useState("");
  const [manualT, setManualT] = useState("");
  const [composeT, setComposeT] = useState("");
  const [autoModel, setAutoModel] = useState("gpt-5-nano");
  const [manualModel, setManualModel] = useState("gpt-5-nano");
  const [createModel, setCreateModel] = useState("gpt-5-nano");
  const [rewriteFallbackModel, setRewriteFallbackModel] = useState("gpt-4.1-mini");
  const [createFallbackModel, setCreateFallbackModel] = useState("gpt-4.1-mini");
  const [rewriteTimeoutMs, setRewriteTimeoutMs] = useState(20000);
  const [createTimeoutMs, setCreateTimeoutMs] = useState(45000);
  const [rewriteMaxTokens, setRewriteMaxTokens] = useState(1200);
  const [rewriteAutoHardCapTokens, setRewriteAutoHardCapTokens] = useState(650);
  const [createMaxTokens, setCreateMaxTokens] = useState(2800);
  const [createContinuationRounds, setCreateContinuationRounds] = useState(3);
  const [createTemplateMaxChars, setCreateTemplateMaxChars] = useState(3500);
  const [createUserSlotMaxChars, setCreateUserSlotMaxChars] = useState(2200);
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
      setAutoModel(String(data.rewrite_auto_model || "gpt-5-nano").trim() || "gpt-5-nano");
      setManualModel(String(data.rewrite_manual_model || "gpt-5-nano").trim() || "gpt-5-nano");
      setCreateModel(String(data.create_model || "gpt-5-nano").trim() || "gpt-5-nano");
      setRewriteFallbackModel(
        String(data.rewrite_fallback_model || "gpt-4.1-mini").trim() || "gpt-4.1-mini"
      );
      setCreateFallbackModel(String(data.create_fallback_model || "gpt-4.1-mini").trim() || "gpt-4.1-mini");
      setRewriteTimeoutMs(
        Number.isFinite(data.rewrite_timeout_ms) ? Number(data.rewrite_timeout_ms) : 20000
      );
      setCreateTimeoutMs(
        Number.isFinite(data.create_timeout_ms) ? Number(data.create_timeout_ms) : 45000
      );
      setRewriteMaxTokens(
        Number.isFinite(data.rewrite_max_completion_tokens) ? Number(data.rewrite_max_completion_tokens) : 1200
      );
      setRewriteAutoHardCapTokens(
        Number.isFinite(data.rewrite_auto_hard_cap_tokens) ? Number(data.rewrite_auto_hard_cap_tokens) : 650
      );
      setCreateMaxTokens(
        Number.isFinite(data.create_max_completion_tokens) ? Number(data.create_max_completion_tokens) : 2800
      );
      setCreateContinuationRounds(
        Number.isFinite(data.create_continuation_max_rounds) ? Number(data.create_continuation_max_rounds) : 3
      );
      setCreateTemplateMaxChars(
        Number.isFinite(data.create_template_max_chars) ? Number(data.create_template_max_chars) : 3500
      );
      setCreateUserSlotMaxChars(
        Number.isFinite(data.create_user_slot_max_chars) ? Number(data.create_user_slot_max_chars) : 2200
      );
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
          compose_template: composeT,
          rewrite_auto_model: autoModel,
          rewrite_manual_model: manualModel,
          create_model: createModel,
          rewrite_fallback_model: rewriteFallbackModel,
          create_fallback_model: createFallbackModel,
          rewrite_timeout_ms: rewriteTimeoutMs,
          create_timeout_ms: createTimeoutMs,
          rewrite_max_completion_tokens: rewriteMaxTokens,
          rewrite_auto_hard_cap_tokens: rewriteAutoHardCapTokens,
          create_max_completion_tokens: createMaxTokens,
          create_continuation_max_rounds: createContinuationRounds,
          create_template_max_chars: createTemplateMaxChars,
          create_user_slot_max_chars: createUserSlotMaxChars
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Save failed");
        return;
      }
      setMessage("Saved. New templates and runtime controls apply on next optimize calls (cache ~45s).");
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
          <Link
            href="/admin/plan-limits"
            className="rounded-lg border border-violet-500/40 px-3 py-2 text-sm text-violet-200 hover:bg-violet-500/10"
          >
            Plan limits
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

          <section className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-violet-300/90">
              Runtime controls
            </h2>
            <p className="mb-4 text-xs text-violet-200/70">
              Control provider timeouts and output budget without redeploying Vercel env vars.
            </p>
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Auto rewrite model
                <input
                  type="text"
                  value={autoModel}
                  onChange={(e) => setAutoModel(e.target.value)}
                  placeholder="gpt-5-nano"
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Improve model (manual)
                <input
                  type="text"
                  value={manualModel}
                  onChange={(e) => setManualModel(e.target.value)}
                  placeholder="gpt-5-nano"
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Create model
                <input
                  type="text"
                  value={createModel}
                  onChange={(e) => setCreateModel(e.target.value)}
                  placeholder="gpt-5-nano"
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
            </div>
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Rewrite fallback model
                <input
                  type="text"
                  value={rewriteFallbackModel}
                  onChange={(e) => setRewriteFallbackModel(e.target.value)}
                  placeholder="gpt-4.1-mini"
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Create fallback model
                <input
                  type="text"
                  value={createFallbackModel}
                  onChange={(e) => setCreateFallbackModel(e.target.value)}
                  placeholder="gpt-4.1-mini"
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Rewrite timeout (ms)
                <input
                  type="number"
                  min={8000}
                  max={120000}
                  step={1000}
                  value={rewriteTimeoutMs}
                  onChange={(e) => setRewriteTimeoutMs(Number(e.target.value) || 20000)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Create timeout (ms)
                <input
                  type="number"
                  min={10000}
                  max={180000}
                  step={1000}
                  value={createTimeoutMs}
                  onChange={(e) => setCreateTimeoutMs(Number(e.target.value) || 45000)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Rewrite max completion tokens
                <input
                  type="number"
                  min={180}
                  max={4000}
                  step={10}
                  value={rewriteMaxTokens}
                  onChange={(e) => setRewriteMaxTokens(Number(e.target.value) || 1200)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Auto rewrite hard cap tokens
                <input
                  type="number"
                  min={180}
                  max={4000}
                  step={10}
                  value={rewriteAutoHardCapTokens}
                  onChange={(e) => setRewriteAutoHardCapTokens(Number(e.target.value) || 650)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Create max completion tokens
                <input
                  type="number"
                  min={500}
                  max={8000}
                  step={25}
                  value={createMaxTokens}
                  onChange={(e) => setCreateMaxTokens(Number(e.target.value) || 2800)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Create template max chars
                <input
                  type="number"
                  min={800}
                  max={24000}
                  step={100}
                  value={createTemplateMaxChars}
                  onChange={(e) => setCreateTemplateMaxChars(Number(e.target.value) || 3500)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Create user slot max chars
                <input
                  type="number"
                  min={400}
                  max={12000}
                  step={100}
                  value={createUserSlotMaxChars}
                  onChange={(e) => setCreateUserSlotMaxChars(Number(e.target.value) || 2200)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80 sm:col-span-2">
                Create continuation rounds (for truncated outputs)
                <input
                  type="number"
                  min={1}
                  max={6}
                  step={1}
                  value={createContinuationRounds}
                  onChange={(e) => setCreateContinuationRounds(Number(e.target.value) || 3)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save templates + runtime controls"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
