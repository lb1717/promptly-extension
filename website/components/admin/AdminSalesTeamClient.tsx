"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SALES_TEAM_LINK_COUNT } from "@/lib/salesTeamOffers";

type SalesTeam = {
  id: string;
  name: string;
  slug: string;
  internalNote: string | null;
  active: boolean;
  signupCount: number;
  linkCount: number;
  createdAt: string | null;
};

type TeamLink = {
  id: string;
  slug: string;
  offerLabel: string | null;
  tier: string;
  signupCount: number;
  active: boolean;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

export function AdminSalesTeamClient() {
  const [teams, setTeams] = useState<SalesTeam[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detailLinks, setDetailLinks] = useState<TeamLink[]>([]);
  const [detailTeam, setDetailTeam] = useState<SalesTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [copiedKey, setCopiedKey] = useState("");

  const linkCount = SALES_TEAM_LINK_COUNT;

  const origin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  const loadTeams = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/sales-team", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load sales team.");
        return;
      }
      setTeams(Array.isArray(data.teams) ? data.teams : []);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) {
      setDetailTeam(null);
      setDetailLinks([]);
      return;
    }
    setDetailLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/sales-team/${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load links.");
        return;
      }
      setDetailTeam(data.team || null);
      setDetailLinks(Array.isArray(data.links) ? data.links : []);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
    }
  }, [selectedId, loadDetail]);

  async function createTeam() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a salesperson name.");
      return;
    }
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/admin/sales-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          slug: slug.trim() || null,
          internal_note: internalNote.trim() || null
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create sales team.");
        return;
      }
      setMessage(`Created ${linkCount} links for ${data.team?.name || trimmed}.`);
      setName("");
      setSlug("");
      setInternalNote("");
      setShowForm(false);
      await loadTeams();
      if (data.team?.id) {
        setSelectedId(data.team.id);
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  async function setTeamActive(team: SalesTeam, active: boolean) {
    setUpdatingId(team.id);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/sales-team/${encodeURIComponent(team.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update team.");
        return;
      }
      setMessage(active ? `Reactivated links for ${team.name}.` : `Deactivated all links for ${team.name}.`);
      await loadTeams();
      if (selectedId === team.id) {
        await loadDetail(team.id);
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setUpdatingId("");
    }
  }

  async function deleteTeam(team: SalesTeam) {
    const confirmed = window.confirm(
      `Delete "${team.name}" and all ${team.linkCount || linkCount} links?\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(team.id);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/sales-team/${encodeURIComponent(team.id)}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete team.");
        return;
      }
      setMessage(`Deleted ${team.name} and all links.`);
      if (selectedId === team.id) {
        setSelectedId("");
        setDetailTeam(null);
        setDetailLinks([]);
      }
      await loadTeams();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setDeletingId("");
    }
  }

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(""), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  async function copyAllLinks() {
    if (!detailLinks.length) return;
    const rows = detailLinks.map((link) => {
      const label = link.offerLabel || link.slug;
      const url = `${origin}/join/${link.slug}`;
      return `${label}\t${url}`;
    });
    await copyText("all", rows.join("\n"));
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="max-w-2xl text-sm text-violet-200/70">
            Create a salesperson profile to auto-generate {linkCount} plan links (discounts + trials). Stripe coupons
            are created once and reused. Copy the table and send it to your rep — no affiliate portal.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowForm((prev) => !prev);
            setMessage("");
            setError("");
          }}
          className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500"
        >
          {showForm ? "Cancel" : "Add salesperson"}
        </button>
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

      {showForm ? (
        <section className="mb-8 rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-300/90">New salesperson</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-violet-200/80">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full rounded-lg border border-violet-500/25 bg-[#1a1228] px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-violet-200/80">URL slug prefix (optional)</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="jane-smith"
                className="w-full rounded-lg border border-violet-500/25 bg-[#1a1228] px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-violet-200/80">Internal note (optional)</span>
              <input
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                placeholder="West coast enterprise"
                className="w-full rounded-lg border border-violet-500/25 bg-[#1a1228] px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
              />
            </label>
          </div>
          <p className="mt-4 text-xs text-violet-300/60">
            This creates {linkCount} links ({linkCount / 3} offers × 3 plans). First run also creates shared Stripe
            percent-off coupons.
          </p>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={createTeam}
              disabled={saving}
              className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60"
            >
              {saving ? "Creating links…" : `Create ${linkCount} links`}
            </button>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-violet-300/90">Salespeople</h2>
          {loading ? (
            <p className="text-sm text-violet-200/70">Loading…</p>
          ) : teams.length === 0 ? (
            <p className="text-sm text-violet-200/70">No salespeople yet.</p>
          ) : (
            <ul className="space-y-2">
              {teams.map((team) => (
                <li key={team.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(team.id)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                      selectedId === team.id
                        ? "border-violet-400/50 bg-violet-500/15"
                        : "border-violet-500/15 bg-[#1a1228]/80 hover:border-violet-400/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-white">{team.name}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          team.active
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-neutral-500/20 text-neutral-300"
                        }`}
                      >
                        {team.active ? "Active" : "Off"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-violet-300/60">
                      {team.signupCount} signups · {team.linkCount || linkCount} links
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5 lg:col-span-3">
          {!selectedId ? (
            <p className="text-sm text-violet-200/70">Select a salesperson to view and copy their links.</p>
          ) : detailLoading && !detailTeam ? (
            <p className="text-sm text-violet-200/70">Loading links…</p>
          ) : detailTeam ? (
            <>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">{detailTeam.name}</h2>
                  <p className="text-xs text-violet-300/60">
                    Slug prefix: {detailTeam.slug} · {formatDate(detailTeam.createdAt)}
                  </p>
                  <p className="mt-1 text-sm text-violet-200/80">{detailTeam.signupCount} total signups</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={copyAllLinks}
                    disabled={!detailLinks.length}
                    className="rounded-lg border border-violet-500/30 px-3 py-1.5 text-xs font-semibold text-violet-100 hover:bg-violet-500/15 disabled:opacity-50"
                  >
                    {copiedKey === "all" ? "Copied table!" : "Copy all (TSV)"}
                  </button>
                  {detailTeam.active ? (
                    <button
                      type="button"
                      onClick={() => setTeamActive(detailTeam, false)}
                      disabled={updatingId === detailTeam.id}
                      className="rounded-lg border border-amber-500/30 px-2.5 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/10 disabled:opacity-60"
                    >
                      Deactivate all
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setTeamActive(detailTeam, true)}
                      disabled={updatingId === detailTeam.id}
                      className="rounded-lg border border-emerald-500/30 px-2.5 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-60"
                    >
                      Reactivate all
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteTeam(detailTeam)}
                    disabled={deletingId === detailTeam.id}
                    className="rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/10 disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-violet-500/20 text-xs uppercase tracking-wider text-violet-300/80">
                      <th className="py-2 pr-4">Offer</th>
                      <th className="py-2 pr-4">Signups</th>
                      <th className="py-2 pr-0">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailLinks.map((link) => {
                      const label = link.offerLabel || link.slug;
                      const url = `${origin}/join/${link.slug}`;
                      const copyId = link.id;
                      return (
                        <tr key={link.id} className="border-b border-violet-500/10 text-violet-100/90">
                          <td className="max-w-[240px] py-2.5 pr-4 font-medium text-white">{label}</td>
                          <td className="py-2.5 pr-4">{link.signupCount}</td>
                          <td className="py-2.5 pr-0">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                              <span className="max-w-[280px] truncate font-mono text-xs text-violet-300/80">{url}</span>
                              <button
                                type="button"
                                onClick={() => copyText(copyId, url)}
                                disabled={!detailTeam.active || !link.active}
                                className="shrink-0 rounded-lg border border-violet-500/30 px-2.5 py-1 text-xs font-semibold text-violet-100 hover:bg-violet-500/15 disabled:opacity-50"
                              >
                                {copiedKey === copyId ? "Copied" : "Copy"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
