"use client";

import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type EngineeringResponse = {
  ok?: boolean;
  user_content_token?: string;
  improve_template?: string;
  refine_template?: string;
  improve_model?: string;
  refine_model?: string;
  fallback_model?: string;
  improve_timeout_ms?: number;
  refine_timeout_ms?: number;
  improve_max_completion_tokens?: number;
  refine_max_completion_tokens?: number;
  refine_continuation_max_rounds?: number;
  suggestion_picker_model?: string;
  suggestion_picker_timeout_ms?: number;
  suggestion_ai_pick_count?: number;
  suggestion_display_min?: number;
  suggestion_display_max?: number;
  suggestion_max_per_category?: number;
  catalog_stats?: {
    total: number;
    categories: Array<{ id: string; label: string; count: number }>;
  };
  default_improve_template?: string;
  default_refine_template?: string;
  error?: string;
};

export function AdminCompanionPromptEngineeringClient() {
  const [token, setToken] = useState("<<PROMPTLY_USER_CONTENT>>");
  const [improveT, setImproveT] = useState("");
  const [refineT, setRefineT] = useState("");
  const [improveModel, setImproveModel] = useState("gpt-5-nano");
  const [refineModel, setRefineModel] = useState("gpt-5-nano");
  const [fallbackModel, setFallbackModel] = useState("gpt-4.1-mini");
  const [improveTimeoutMs, setImproveTimeoutMs] = useState(20_000);
  const [refineTimeoutMs, setRefineTimeoutMs] = useState(20_000);
  const [improveMaxTokens, setImproveMaxTokens] = useState(2200);
  const [refineMaxTokens, setRefineMaxTokens] = useState(2800);
  const [refineContinuationRounds, setRefineContinuationRounds] = useState(3);
  const [suggestionPickerModel, setSuggestionPickerModel] = useState("gpt-5-nano");
  const [suggestionPickerTimeoutMs, setSuggestionPickerTimeoutMs] = useState(15_000);
  const [suggestionAiPickCount, setSuggestionAiPickCount] = useState(5);
  const [suggestionDisplayMin, setSuggestionDisplayMin] = useState(3);
  const [suggestionDisplayMax, setSuggestionDisplayMax] = useState(5);
  const [suggestionMaxPerCategory, setSuggestionMaxPerCategory] = useState(2);
  const [catalogStats, setCatalogStats] = useState<EngineeringResponse["catalog_stats"]>();
  const [defaultImproveTemplate, setDefaultImproveTemplate] = useState("");
  const [defaultRefineTemplate, setDefaultRefineTemplate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/companion-prompt-engineering", { cache: "no-store" });
      const data = (await res.json()) as EngineeringResponse;
      if (!res.ok) {
        setError(data.error || "Failed to load");
        return;
      }
      if (data.user_content_token) setToken(data.user_content_token);
      setImproveT(data.improve_template || "");
      setRefineT(data.refine_template || "");
      setImproveModel(String(data.improve_model || "gpt-5-nano").trim() || "gpt-5-nano");
      setRefineModel(String(data.refine_model || "gpt-5-nano").trim() || "gpt-5-nano");
      setFallbackModel(String(data.fallback_model || "gpt-4.1-mini").trim() || "gpt-4.1-mini");
      setImproveTimeoutMs(Number.isFinite(data.improve_timeout_ms) ? Number(data.improve_timeout_ms) : 20_000);
      setRefineTimeoutMs(Number.isFinite(data.refine_timeout_ms) ? Number(data.refine_timeout_ms) : 20_000);
      setImproveMaxTokens(
        Number.isFinite(data.improve_max_completion_tokens) ? Number(data.improve_max_completion_tokens) : 2200
      );
      setRefineMaxTokens(
        Number.isFinite(data.refine_max_completion_tokens) ? Number(data.refine_max_completion_tokens) : 2800
      );
      setRefineContinuationRounds(
        Number.isFinite(data.refine_continuation_max_rounds) ? Number(data.refine_continuation_max_rounds) : 3
      );
      setSuggestionPickerModel(String(data.suggestion_picker_model || "gpt-5-nano").trim() || "gpt-5-nano");
      setSuggestionPickerTimeoutMs(
        Number.isFinite(data.suggestion_picker_timeout_ms) ? Number(data.suggestion_picker_timeout_ms) : 15_000
      );
      setSuggestionAiPickCount(
        Number.isFinite(data.suggestion_ai_pick_count) ? Number(data.suggestion_ai_pick_count) : 5
      );
      setSuggestionDisplayMin(
        Number.isFinite(data.suggestion_display_min) ? Number(data.suggestion_display_min) : 3
      );
      setSuggestionDisplayMax(
        Number.isFinite(data.suggestion_display_max) ? Number(data.suggestion_display_max) : 5
      );
      setSuggestionMaxPerCategory(
        Number.isFinite(data.suggestion_max_per_category) ? Number(data.suggestion_max_per_category) : 2
      );
      setCatalogStats(data.catalog_stats);
      setDefaultImproveTemplate(String(data.default_improve_template || "").trim());
      setDefaultRefineTemplate(String(data.default_refine_template || "").trim());
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/admin/companion-prompt-engineering", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          improve_template: improveT,
          refine_template: refineT,
          improve_model: improveModel,
          refine_model: refineModel,
          fallback_model: fallbackModel,
          improve_timeout_ms: improveTimeoutMs,
          refine_timeout_ms: refineTimeoutMs,
          improve_max_completion_tokens: improveMaxTokens,
          refine_max_completion_tokens: refineMaxTokens,
          refine_continuation_max_rounds: refineContinuationRounds,
          suggestion_picker_model: suggestionPickerModel,
          suggestion_picker_timeout_ms: suggestionPickerTimeoutMs,
          suggestion_ai_pick_count: suggestionAiPickCount,
          suggestion_display_min: suggestionDisplayMin,
          suggestion_display_max: suggestionDisplayMax,
          suggestion_max_per_category: suggestionMaxPerCategory
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Save failed");
        return;
      }
      setMessage("Saved. Companion uses this config on the next optimize/suggestions call.");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Prompt engineering (Companion)</h1>
          <p className="mt-1 max-w-3xl text-sm text-violet-200/70">
            Separate stack for the desktop Companion app. Uses{" "}
            <span className="font-mono text-violet-100">POST /api/companion/optimize</span> and{" "}
            <span className="font-mono text-violet-100">GET /api/companion/suggestions</span>. The token{" "}
            <span className="font-mono text-amber-200">{token}</span> must appear exactly once in each template.
            Improve suggestions are picked server-side from the suggestion database below.
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
            href="/admin/prompt-engineering"
            className="rounded-lg border border-violet-500/40 px-3 py-2 text-sm text-violet-200 hover:bg-violet-500/10"
          >
            Extension PE
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
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-violet-300/90">Improve mode</h2>
            <p className="mb-3 text-xs text-violet-200/70">
              User input is an <span className="font-medium text-violet-100">EXTERNAL AI REQUEST</span> — text for
              another AI to execute. Output must be an improved EXTERNAL AI REQUEST only (not instructions about
              improving, not an answer to the request).
            </p>
            <p className="mb-3 text-xs text-violet-200/70">
              Template must include{" "}
              <span className="font-mono text-violet-100">&lt;&lt;PROMPTLY_USER_CONTENT&gt;&gt;</span> exactly once.
              That token is replaced with the user&apos;s draft (e.g. &quot;Draft a letter to my teacher…&quot;).
            </p>
            <p className="mb-3 text-xs text-violet-200/70">
              After generation, the backend validates the output (heuristics + a lightweight check call). If the
              result echoes template text or is not a real rewrite, it automatically retries with a correction.
            </p>
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  if (defaultImproveTemplate) {
                    setImproveT(defaultImproveTemplate);
                    setMessage("Loaded default improve template — click Save to apply in production.");
                  }
                }}
                disabled={!defaultImproveTemplate}
                className="rounded-lg border border-violet-500/40 px-3 py-1.5 text-xs text-violet-100 hover:bg-violet-500/10 disabled:opacity-50"
              >
                Reset improve template to default
              </button>
            </div>
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Model
                <input
                  type="text"
                  value={improveModel}
                  onChange={(e) => setImproveModel(e.target.value)}
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
                  value={improveTimeoutMs}
                  onChange={(e) => setImproveTimeoutMs(Number(e.target.value) || 20_000)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Max completion tokens
                <input
                  type="number"
                  min={180}
                  max={20000}
                  step={10}
                  value={improveMaxTokens}
                  onChange={(e) => setImproveMaxTokens(Number(e.target.value) || 2200)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80 sm:col-span-3">
                Fallback model (Improve + Refine)
                <input
                  type="text"
                  value={fallbackModel}
                  onChange={(e) => setFallbackModel(e.target.value)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
            </div>
            <textarea
              value={improveT}
              onChange={(e) => setImproveT(e.target.value)}
              rows={14}
              className="w-full resize-y rounded-xl border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 font-mono text-sm text-violet-50"
            />
          </section>

          <section className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-violet-300/90">Refine mode</h2>
            <p className="mb-3 text-xs text-violet-200/70">
              Apply feedback pass (<span className="font-mono">refine</span>). Input slot uses{" "}
              <span className="font-mono text-violet-100">EXTERNAL_AI_REQUEST</span> +{" "}
              <span className="font-mono text-violet-100">MODIFICATION_FEEDBACK</span> blocks. Output: revised
              EXTERNAL AI REQUEST + one-sentence summary (delimiter markers).
            </p>
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  if (defaultRefineTemplate) {
                    setRefineT(defaultRefineTemplate);
                    setMessage("Loaded default refine template — click Save to apply in production.");
                  }
                }}
                disabled={!defaultRefineTemplate}
                className="rounded-lg border border-violet-500/40 px-3 py-1.5 text-xs text-violet-100 hover:bg-violet-500/10 disabled:opacity-50"
              >
                Reset refine template to default
              </button>
            </div>
            <p className="mb-3 text-xs text-violet-200/70">
              A validation check round confirms feedback was integrated (not pasted at the end) and the summary is one
              sentence. Failed checks trigger an automatic correction retry.
            </p>
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Model
                <input
                  type="text"
                  value={refineModel}
                  onChange={(e) => setRefineModel(e.target.value)}
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
                  value={refineTimeoutMs}
                  onChange={(e) => setRefineTimeoutMs(Number(e.target.value) || 20_000)}
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
                  value={refineMaxTokens}
                  onChange={(e) => setRefineMaxTokens(Number(e.target.value) || 2800)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80 sm:col-span-3">
                Continuation rounds
                <input
                  type="number"
                  min={1}
                  max={6}
                  step={1}
                  value={refineContinuationRounds}
                  onChange={(e) => setRefineContinuationRounds(Number(e.target.value) || 3)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
            </div>
            <textarea
              value={refineT}
              onChange={(e) => setRefineT(e.target.value)}
              rows={16}
              className="w-full resize-y rounded-xl border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 font-mono text-sm text-violet-50"
            />
          </section>

          <section className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-violet-300/90">
              Improve suggestions (AI picker)
            </h2>
            <p className="mb-4 text-xs text-violet-200/70">
              Separate from improve/refine. After improve, Companion sends the full prompt to{" "}
              <span className="font-mono text-violet-100">POST /api/companion/suggestions</span>. The picker model
              reads the prompt and chooses the most relevant chips from the code catalog (
              {catalogStats?.total ?? 308} suggestions, {catalogStats?.categories.length ?? 18} categories). Category
              diversity rules ensure at least 3 chips with max 2 per category.
            </p>

            <div className="mb-4 rounded-xl border border-violet-500/15 bg-[#150c22]/50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-300/90">Catalog</p>
              <p className="mb-3 text-xs text-violet-200/70">
                Source: <span className="font-mono text-violet-100">website/lib/server/companionSuggestionCatalog.json</span>
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {(catalogStats?.categories || []).map((cat) => (
                  <div
                    key={cat.id}
                    className="rounded-lg border border-violet-500/10 bg-[#0f0818]/40 px-2 py-1.5 text-xs text-violet-200/80"
                  >
                    <span className="font-medium text-violet-100">{cat.label}</span>
                    <span className="text-violet-300/60"> · {cat.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Picker model
                <input
                  type="text"
                  value={suggestionPickerModel}
                  onChange={(e) => setSuggestionPickerModel(e.target.value)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Picker timeout (ms)
                <input
                  type="number"
                  min={8000}
                  max={60000}
                  step={1000}
                  value={suggestionPickerTimeoutMs}
                  onChange={(e) => setSuggestionPickerTimeoutMs(Number(e.target.value) || 15_000)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                AI pick count (before diversity)
                <input
                  type="number"
                  min={3}
                  max={8}
                  value={suggestionAiPickCount}
                  onChange={(e) => setSuggestionAiPickCount(Number(e.target.value) || 5)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Display min
                <input
                  type="number"
                  min={3}
                  max={6}
                  value={suggestionDisplayMin}
                  onChange={(e) => setSuggestionDisplayMin(Number(e.target.value) || 3)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Display max
                <input
                  type="number"
                  min={3}
                  max={6}
                  value={suggestionDisplayMax}
                  onChange={(e) => setSuggestionDisplayMax(Number(e.target.value) || 5)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Max per category
                <input
                  type="number"
                  min={1}
                  max={3}
                  value={suggestionMaxPerCategory}
                  onChange={(e) => setSuggestionMaxPerCategory(Number(e.target.value) || 2)}
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
              {saving ? "Saving…" : "Save companion config"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
