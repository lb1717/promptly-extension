"use client";

import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type TierLimitsResponse = {
  ok?: boolean;
  free_daily_token_limit?: number;
  pro_daily_token_limit?: number;
  student_daily_token_limit?: number;
  enterprise_daily_token_limit?: number;
  global_daily_token_limit?: number | null;
  defaults?: { free: number; pro: number; student: number; enterprise: number; global: number | null };
  error?: string;
};

export function AdminTierLimitsClient() {
  const [freeInput, setFreeInput] = useState("");
  const [proInput, setProInput] = useState("");
  const [studentInput, setStudentInput] = useState("");
  const [enterpriseInput, setEnterpriseInput] = useState("");
  const [globalInput, setGlobalInput] = useState("");
  const [defaults, setDefaults] = useState<{
    free: number;
    pro: number;
    student: number;
    enterprise: number;
    global: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/tier-limits", { cache: "no-store" });
      const data = (await res.json()) as TierLimitsResponse;
      if (!res.ok) {
        setError(data.error || "Failed to load");
        return;
      }
      if (data.free_daily_token_limit != null) setFreeInput(String(data.free_daily_token_limit));
      if (data.pro_daily_token_limit != null) setProInput(String(data.pro_daily_token_limit));
      if (data.student_daily_token_limit != null) setStudentInput(String(data.student_daily_token_limit));
      if (data.enterprise_daily_token_limit != null) setEnterpriseInput(String(data.enterprise_daily_token_limit));
      setGlobalInput(data.global_daily_token_limit == null ? "" : String(data.global_daily_token_limit));
      if (data.defaults) setDefaults(data.defaults);
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
    const free = Math.floor(Number(freeInput));
    const pro = Math.floor(Number(proInput));
    const student = Math.floor(Number(studentInput));
    const enterprise = Math.floor(Number(enterpriseInput));
    const globalRaw = globalInput.trim();
    const global = globalRaw === "" ? null : Math.floor(Number(globalRaw));
    if (
      !Number.isFinite(free) ||
      free < 1 ||
      !Number.isFinite(pro) ||
      pro < 1 ||
      !Number.isFinite(student) ||
      student < 1 ||
      !Number.isFinite(enterprise) ||
      enterprise < 1 ||
      (global !== null && (!Number.isFinite(global) || global < 1))
    ) {
      setError("Enter positive integers for Free/Pro/Student/Enterprise. Leave global blank to disable global cap.");
      setMessage("");
      return;
    }
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/admin/tier-limits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          free_daily_token_limit: free,
          pro_daily_token_limit: pro,
          student_daily_token_limit: student,
          enterprise_daily_token_limit: enterprise,
          global_daily_token_limit: global
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Save failed");
        return;
      }
      setMessage(
        "Saved. Free/Pro/Student/Enterprise caps apply by subscription tier, then global cap (if set) is enforced across all users."
      );
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  async function consolidateDuplicates() {
    setConsolidating(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/admin/users/consolidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_email_groups: 1000 })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Consolidation failed");
        return;
      }
      const mergedGroups = Number(data?.merged_email_groups || 0);
      const mergedAccounts = Number(data?.merged_accounts || 0);
      setMessage(`Consolidation finished. Merged ${mergedAccounts} duplicate accounts across ${mergedGroups} emails.`);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setConsolidating(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Plan limits</h1>
          <p className="mt-1 text-sm text-violet-200/70">
            Daily token budget per UTC day from OpenAI usage. <strong className="text-violet-100">Free</strong> users
            use the first value; <strong className="text-violet-100">Promptly Pro</strong>,{" "}
            <strong className="text-violet-100">Student</strong>, and{" "}
            <strong className="text-violet-100">Enterprise</strong> each use their own configured limit. Stripe
            webhooks and saved subscription tiers set this value; limits apply on every extension/API request. You can
            also set one global ceiling across all plans.
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
            Prompt engineering
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
        <section className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-violet-300/90">
            Daily token limits
          </h2>
          {defaults ? (
            <p className="mb-4 text-xs text-violet-200/65">
              Built-in defaults if unset: Free {defaults.free.toLocaleString()} · Pro {defaults.pro.toLocaleString()} ·
              Student {defaults.student.toLocaleString()} · Enterprise {defaults.enterprise.toLocaleString()} · Global
              cap disabled
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <label className="flex flex-col gap-1 text-xs text-violet-200/90">
              Free plan (tokens / UTC day)
              <input
                type="number"
                min={1}
                className="rounded-lg border border-violet-500/30 bg-[#161022] px-3 py-2 text-sm text-white"
                value={freeInput}
                onChange={(e) => setFreeInput(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-violet-200/90">
              Promptly Pro (tokens / UTC day)
              <input
                type="number"
                min={1}
                className="rounded-lg border border-violet-500/30 bg-[#161022] px-3 py-2 text-sm text-white"
                value={proInput}
                onChange={(e) => setProInput(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-violet-200/90">
              Student (tokens / UTC day)
              <input
                type="number"
                min={1}
                className="rounded-lg border border-violet-500/30 bg-[#161022] px-3 py-2 text-sm text-white"
                value={studentInput}
                onChange={(e) => setStudentInput(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-violet-200/90">
              Enterprise (tokens / UTC day)
              <input
                type="number"
                min={1}
                className="rounded-lg border border-violet-500/30 bg-[#161022] px-3 py-2 text-sm text-white"
                value={enterpriseInput}
                onChange={(e) => setEnterpriseInput(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-violet-200/90">
              Global cap (all users / UTC day)
              <input
                type="number"
                min={1}
                placeholder="Disabled"
                className="rounded-lg border border-violet-500/30 bg-[#161022] px-3 py-2 text-sm text-white placeholder:text-violet-300/50"
                value={globalInput}
                onChange={(e) => setGlobalInput(e.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => save()}
            disabled={saving}
            className="mt-6 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save plan limits"}
          </button>
          <button
            type="button"
            onClick={() => consolidateDuplicates()}
            disabled={consolidating}
            className="mt-3 rounded-lg border border-violet-500/40 px-4 py-2 text-sm font-semibold text-violet-100 hover:bg-violet-500/10 disabled:opacity-50"
          >
            {consolidating ? "Consolidating…" : "Consolidate duplicate accounts"}
          </button>
        </section>
      )}
    </main>
  );
}
