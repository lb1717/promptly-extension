"use client";

import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type CompanionSuggestionOption = {
  id: string;
  label: string;
  snippet: string;
  enabled?: boolean;
};

type CompanionSuggestionGroup = {
  id: string;
  label?: string;
  enabled?: boolean;
  options: CompanionSuggestionOption[];
};

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
  suggestion_word_threshold?: number;
  suggestion_count_short?: number;
  suggestion_count_long?: number;
  suggestion_groups?: CompanionSuggestionGroup[];
  error?: string;
};

function newGroupId() {
  return `group-${Date.now().toString(36)}`;
}

function newOptionId(groupId: string) {
  return `${groupId}-opt-${Math.random().toString(36).slice(2, 7)}`;
}

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
  const [suggestionWordThreshold, setSuggestionWordThreshold] = useState(100);
  const [suggestionCountShort, setSuggestionCountShort] = useState(5);
  const [suggestionCountLong, setSuggestionCountLong] = useState(6);
  const [suggestionGroups, setSuggestionGroups] = useState<CompanionSuggestionGroup[]>([]);
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
      setSuggestionWordThreshold(
        Number.isFinite(data.suggestion_word_threshold) ? Number(data.suggestion_word_threshold) : 100
      );
      setSuggestionCountShort(
        Number.isFinite(data.suggestion_count_short) ? Number(data.suggestion_count_short) : 5
      );
      setSuggestionCountLong(Number.isFinite(data.suggestion_count_long) ? Number(data.suggestion_count_long) : 6);
      setSuggestionGroups(Array.isArray(data.suggestion_groups) ? data.suggestion_groups : []);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updateGroup(groupIndex: number, patch: Partial<CompanionSuggestionGroup>) {
    setSuggestionGroups((prev) =>
      prev.map((group, index) => (index === groupIndex ? { ...group, ...patch } : group))
    );
  }

  function updateOption(groupIndex: number, optionIndex: number, patch: Partial<CompanionSuggestionOption>) {
    setSuggestionGroups((prev) =>
      prev.map((group, gi) =>
        gi !== groupIndex
          ? group
          : {
              ...group,
              options: group.options.map((option, oi) =>
                oi !== optionIndex ? option : { ...option, ...patch }
              )
            }
      )
    );
  }

  function addGroup() {
    const id = newGroupId();
    setSuggestionGroups((prev) => [
      ...prev,
      {
        id,
        label: "New group",
        enabled: true,
        options: [{ id: newOptionId(id), label: "New suggestion", snippet: "<<>>", enabled: true }]
      }
    ]);
  }

  function removeGroup(groupIndex: number) {
    setSuggestionGroups((prev) => prev.filter((_, index) => index !== groupIndex));
  }

  function addOption(groupIndex: number) {
    setSuggestionGroups((prev) =>
      prev.map((group, index) =>
        index !== groupIndex
          ? group
          : {
              ...group,
              options: [
                ...group.options,
                {
                  id: newOptionId(group.id),
                  label: "New suggestion",
                  snippet: "<<>>",
                  enabled: true
                }
              ]
            }
      )
    );
  }

  function removeOption(groupIndex: number, optionIndex: number) {
    setSuggestionGroups((prev) =>
      prev.map((group, gi) =>
        gi !== groupIndex ? group : { ...group, options: group.options.filter((_, oi) => oi !== optionIndex) }
      )
    );
  }

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
          suggestion_word_threshold: suggestionWordThreshold,
          suggestion_count_short: suggestionCountShort,
          suggestion_count_long: suggestionCountLong,
          suggestion_groups: suggestionGroups
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
              First pass when the user clicks Improve in Companion (<span className="font-mono">improve</span>).
            </p>
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
              Apply feedback pass (<span className="font-mono">refine</span>). User slot is prompt + ⬥⬥⬥ + feedback.
              Output uses delimiter markers for prompt and summary.
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
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-300/90">
                  Improve suggestions database
                </h2>
                <p className="mt-1 text-xs text-violet-200/70">
                  Groups are mutually exclusive — one random option per group is shown. Expand this database over time.
                </p>
              </div>
              <button
                type="button"
                onClick={addGroup}
                className="rounded-lg border border-violet-500/40 px-3 py-2 text-sm text-violet-100 hover:bg-violet-500/10"
              >
                + Add group
              </button>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Word threshold (short vs long count)
                <input
                  type="number"
                  min={20}
                  max={2000}
                  value={suggestionWordThreshold}
                  onChange={(e) => setSuggestionWordThreshold(Number(e.target.value) || 100)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Count (prompt ≤ threshold words)
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={suggestionCountShort}
                  onChange={(e) => setSuggestionCountShort(Number(e.target.value) || 5)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-violet-200/80">
                Count (prompt &gt; threshold words)
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={suggestionCountLong}
                  onChange={(e) => setSuggestionCountLong(Number(e.target.value) || 6)}
                  className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-3 py-2 text-sm text-violet-50"
                />
              </label>
            </div>

            <div className="flex flex-col gap-4">
              {suggestionGroups.map((group, groupIndex) => (
                <div
                  key={`${group.id}-${groupIndex}`}
                  className="rounded-xl border border-violet-500/15 bg-[#150c22]/50 p-4"
                >
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <label className="flex flex-1 flex-col gap-1 text-xs text-violet-200/80">
                      Group id
                      <input
                        type="text"
                        value={group.id}
                        onChange={(e) => updateGroup(groupIndex, { id: e.target.value })}
                        className="rounded-lg border border-violet-500/25 bg-[#0f0818]/80 px-3 py-2 text-sm text-violet-50"
                      />
                    </label>
                    <label className="flex flex-1 flex-col gap-1 text-xs text-violet-200/80">
                      Label (optional)
                      <input
                        type="text"
                        value={group.label || ""}
                        onChange={(e) => updateGroup(groupIndex, { label: e.target.value })}
                        className="rounded-lg border border-violet-500/25 bg-[#0f0818]/80 px-3 py-2 text-sm text-violet-50"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-violet-200/80">
                      <input
                        type="checkbox"
                        checked={group.enabled !== false}
                        onChange={(e) => updateGroup(groupIndex, { enabled: e.target.checked })}
                      />
                      Enabled
                    </label>
                    <button
                      type="button"
                      onClick={() => removeGroup(groupIndex)}
                      className="rounded-lg border border-red-400/30 px-3 py-2 text-xs text-red-200 hover:bg-red-500/10"
                    >
                      Remove group
                    </button>
                  </div>

                  <div className="flex flex-col gap-3">
                    {group.options.map((option, optionIndex) => (
                      <div
                        key={`${option.id}-${optionIndex}`}
                        className="grid grid-cols-1 gap-3 rounded-lg border border-violet-500/10 bg-[#0f0818]/40 p-3 lg:grid-cols-12"
                      >
                        <label className="flex flex-col gap-1 text-xs text-violet-200/80 lg:col-span-2">
                          Option id
                          <input
                            type="text"
                            value={option.id}
                            onChange={(e) => updateOption(groupIndex, optionIndex, { id: e.target.value })}
                            className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-2 py-1.5 text-sm text-violet-50"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-violet-200/80 lg:col-span-3">
                          Chip label
                          <input
                            type="text"
                            value={option.label}
                            onChange={(e) => updateOption(groupIndex, optionIndex, { label: e.target.value })}
                            className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-2 py-1.5 text-sm text-violet-50"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-violet-200/80 lg:col-span-6">
                          Snippet (appended to prompt on click)
                          <input
                            type="text"
                            value={option.snippet}
                            onChange={(e) => updateOption(groupIndex, optionIndex, { snippet: e.target.value })}
                            className="rounded-lg border border-violet-500/25 bg-[#150c22]/80 px-2 py-1.5 text-sm text-violet-50"
                          />
                        </label>
                        <div className="flex items-end gap-2 lg:col-span-1">
                          <label className="flex items-center gap-2 text-xs text-violet-200/80">
                            <input
                              type="checkbox"
                              checked={option.enabled !== false}
                              onChange={(e) => updateOption(groupIndex, optionIndex, { enabled: e.target.checked })}
                            />
                            On
                          </label>
                          <button
                            type="button"
                            onClick={() => removeOption(groupIndex, optionIndex)}
                            className="text-xs text-red-300 hover:text-red-200"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => addOption(groupIndex)}
                    className="mt-3 rounded-lg border border-violet-500/30 px-3 py-1.5 text-xs text-violet-200 hover:bg-violet-500/10"
                  >
                    + Add option
                  </button>
                </div>
              ))}
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
