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
  const [rewriteMaxTokens, setRewriteMaxTokens] = useState(2200);
  const [rewriteAutoHardCapTokens, setRewriteAutoHardCapTokens] = useState(2200);
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
        Number.isFinite(data.rewrite_max_completion_tokens) ? Number(data.rewrite_max_completion_tokens) : 2200
      );
      setRewriteAutoHardCapTokens(
        Number.isFinite(data.rewrite_auto_hard_cap_tokens) ? Number(data.rewrite_auto_hard_cap_tokens) : 2200
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
            Production <span className="font-mono text-violet-100">POST /api/optimize</span> uses{" "}
            <span className="font-mono text-violet-100">optimize_mode</span>:{" "}
            <span className="text-violet-100">auto</span>, <span className="text-violet-100">improve</span>, or{" "}
            <span className="text-violet-100">generate</span> (legacy <span className="font-mono">request_mode</span> is
            still accepted). Each mode uses one template string below plus runtime limits and models. The token{" "}
            <span className="font-mono text-amber-200">{token}</span> must appear{" "}
            <span className="text-violet-100">exactly once</span>. Text before and after the token is sent as the{" "}
            <span className="font-mono text-violet-100">first user</span> message (meta instructions). A second{" "}
            <span className="font-mono text-violet-100">user</span> message carries a fixed &quot;rewrite / generate from
            this&quot; wrapper plus the user&apos;s text. OpenAI Chat Completions and the Responses API both receive
            that two-turn user sequence (Responses maps roles the same way). If the extension proxy points at a separate
            worker host, that host may use its own built-in prompts unless it forwards to this API.
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
              Auto mode
            </h2>
            <p className="mb-3 text-xs text-violet-200/70">
              Used when the user has Auto enabled and sends from the chat box (<span className="font-mono">auto</span>
              ). Put your framework around the token; the user&apos;s input arrives in the second user message with an
              auto-style task line. Output cap uses the lower of &quot;Max completion tokens&quot; and &quot;Auto hard
              cap&quot; below.
            </p>
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Model
                <input
                  type="text"
                  value={autoModel}
                  onChange={(e) => setAutoModel(e.target.value)}
                  placeholder="gpt-5-nano"
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Timeout (ms)
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
                Auto hard cap (completion tokens)
                <input
                  type="number"
                  min={180}
                  max={20000}
                  step={10}
                  value={rewriteAutoHardCapTokens}
                  onChange={(e) => setRewriteAutoHardCapTokens(Number(e.target.value) || 2200)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80 sm:col-span-3">
                Fallback model (shared with Improve mode)
                <input
                  type="text"
                  value={rewriteFallbackModel}
                  onChange={(e) => setRewriteFallbackModel(e.target.value)}
                  placeholder="gpt-4.1-mini"
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
            </div>
            <textarea
              value={autoT}
              onChange={(e) => setAutoT(e.target.value)}
              rows={12}
              className="w-full resize-y rounded-xl border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 font-mono text-sm text-violet-50 placeholder:text-violet-400/40"
            />
          </section>

          <section className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-violet-300/90">
              Improve mode
            </h2>
            <p className="mb-3 text-xs text-violet-200/70">
              Used for explicit Improve (<span className="font-mono">improve</span>) from the tab or extension. Same
              split: framework around the token, then a second user message with an improve-style task line and the
              user&apos;s prompt.
            </p>
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Model
                <input
                  type="text"
                  value={manualModel}
                  onChange={(e) => setManualModel(e.target.value)}
                  placeholder="gpt-5-nano"
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Timeout (ms)
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
                Max completion tokens (Auto + Improve output)
                <input
                  type="number"
                  min={180}
                  max={20000}
                  step={10}
                  value={rewriteMaxTokens}
                  onChange={(e) => setRewriteMaxTokens(Number(e.target.value) || 2200)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80 sm:col-span-3">
                Fallback model (shared with Auto mode)
                <input
                  type="text"
                  value={rewriteFallbackModel}
                  onChange={(e) => setRewriteFallbackModel(e.target.value)}
                  placeholder="gpt-4.1-mini"
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
            </div>
            <textarea
              value={manualT}
              onChange={(e) => setManualT(e.target.value)}
              rows={12}
              className="w-full resize-y rounded-xl border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 font-mono text-sm text-violet-50 placeholder:text-violet-400/40"
            />
          </section>

          <section className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-violet-300/90">
              Generate mode
            </h2>
            <p className="mb-3 text-xs text-violet-200/70">
              Used for Generate Prompt (<span className="font-mono">generate</span>). The template should steer the model
              to output instructions for doing the user&apos;s real task—not meta-lessons on how to write prompts.
              Avoid templates that push boilerplate &lt;forbidden&gt; blocks about generic prompts; bans should reflect
              the user&apos;s actual task only.
            </p>
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Model
                <input
                  type="text"
                  value={createModel}
                  onChange={(e) => setCreateModel(e.target.value)}
                  placeholder="gpt-5-nano"
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Timeout (ms)
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
                Fallback model
                <input
                  type="text"
                  value={createFallbackModel}
                  onChange={(e) => setCreateFallbackModel(e.target.value)}
                  placeholder="gpt-4.1-mini"
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Max completion tokens
                <input
                  type="number"
                  min={500}
                  max={20000}
                  step={25}
                  value={createMaxTokens}
                  onChange={(e) => setCreateMaxTokens(Number(e.target.value) || 2800)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Continuation rounds
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
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Template max chars
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
              <label className="flex flex-col gap-1 text-xs text-violet-200/80 sm:col-span-3">
                User description max chars
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
            </div>
            <p className="mb-3 text-xs text-violet-200/70">
              The description is not spliced into the policy string; it is sent only in the second user message. Keep
              the token once so your before/after text can reference “the next user message.”
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
              {saving ? "Saving…" : "Save templates + runtime controls"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
