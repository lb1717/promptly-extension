"use client";

import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Company = {
  id: string;
  name: string;
  logo_url: string | null;
};

type CompanyMember = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: "admin" | "member";
};

type PendingInvite = {
  email: string;
  role: "admin" | "member";
};

type CompanyDetail = {
  company: Company;
  members: CompanyMember[];
  pending_invites: PendingInvite[];
};

export function AdminCompaniesClient() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyLogo, setNewCompanyLogo] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [saving, setSaving] = useState(false);

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/companies", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to load companies");
      setCompanies(json.companies || []);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCompanyDetail = useCallback(async (companyId: string) => {
    setDetailLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/companies/${encodeURIComponent(companyId)}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to load company");
      setDetail({
        company: json.company,
        members: json.members || [],
        pending_invites: json.pending_invites || []
      });
    } catch (e) {
      setDetail(null);
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    if (activeCompanyId) {
      void loadCompanyDetail(activeCompanyId);
    } else {
      setDetail(null);
    }
  }, [activeCompanyId, loadCompanyDetail]);

  function readLogoFile(file: File | null) {
    if (!file) {
      setNewCompanyLogo(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setNewCompanyLogo(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => setError("Could not read logo file.");
    reader.readAsDataURL(file);
  }

  async function createCompany() {
    const name = newCompanyName.trim();
    if (!name) {
      setError("Enter a company name.");
      return;
    }
    setMessage("");
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, logo_url: newCompanyLogo })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not create company");
      setNewCompanyName("");
      setNewCompanyLogo(null);
      setMessage("Company created.");
      await loadCompanies();
      if (json.company?.id) {
        setActiveCompanyId(json.company.id);
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  async function addMember() {
    if (!activeCompanyId) return;
    const email = inviteEmail.trim();
    if (!email) {
      setError("Enter an email address.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/companies/${encodeURIComponent(activeCompanyId)}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not add member");
      setInviteEmail("");
      setMessage(
        json.assigned === "pending"
          ? `${email} will join this company when they sign up.`
          : `${email} added to the company.`
      );
      await loadCompanyDetail(activeCompanyId);
      await loadCompanies();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  async function updateMemberRole(userId: string, role: "admin" | "member") {
    if (!activeCompanyId) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/companies/${encodeURIComponent(activeCompanyId)}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, role })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not update role");
      await loadCompanyDetail(activeCompanyId);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(userId: string) {
    if (!activeCompanyId) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/companies/${encodeURIComponent(activeCompanyId)}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not remove member");
      setMessage("Member removed.");
      await loadCompanyDetail(activeCompanyId);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  async function removePendingInvite(email: string) {
    if (!activeCompanyId) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/companies/${encodeURIComponent(activeCompanyId)}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not remove invite");
      await loadCompanyDetail(activeCompanyId);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  const activeCompany = companies.find((company) => company.id === activeCompanyId) || detail?.company || null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/admin" className="text-sm text-violet-300 hover:text-white">
            ← Admin dashboard
          </Link>
          <h1 className="mt-3 text-2xl font-semibold text-white">Companies</h1>
          <p className="mt-1 text-sm text-violet-200/70">
            Click a company to manage members. Add emails before signup and they will join automatically.
          </p>
        </div>
        <AdminLogoutButton />
      </div>

      {error ? <div className="mb-6 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div> : null}
      {message ? <div className="mb-6 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}

      <section className="mb-8 rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-violet-300/90">Create company</h2>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <input
            value={newCompanyName}
            onChange={(e) => setNewCompanyName(e.target.value)}
            placeholder="Company name"
            className="rounded-lg border border-violet-500/30 bg-[#161022] px-3 py-2 text-sm text-white"
          />
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
            onChange={(e) => readLogoFile(e.target.files?.[0] || null)}
            className="rounded-lg border border-violet-500/30 bg-[#161022] px-3 py-2 text-xs text-violet-100"
          />
          <button
            type="button"
            onClick={createCompany}
            disabled={saving}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-violet-300/90">Companies</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <button
              key={company.id}
              type="button"
              onClick={() => setActiveCompanyId(company.id)}
              className="rounded-xl border border-violet-500/20 bg-[#161022] p-4 text-left transition hover:border-violet-400/50 hover:bg-[#1a1428]"
            >
              <div className="flex items-center gap-3">
                {company.logo_url ? (
                  <img src={company.logo_url} alt="" className="h-10 w-10 rounded-lg object-contain" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/15 text-sm font-semibold text-violet-200">
                    {company.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-semibold text-violet-100">{company.name}</p>
                  <p className="mt-1 text-xs text-violet-300/70">Manage members</p>
                </div>
              </div>
            </button>
          ))}
          {!loading && !companies.length ? <p className="text-sm text-violet-200/70">No companies yet.</p> : null}
        </div>
      </section>

      {activeCompanyId && activeCompany ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-violet-500/30 bg-[#161022] p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                {activeCompany.logo_url ? (
                  <img src={activeCompany.logo_url} alt="" className="h-12 w-12 rounded-xl object-contain" />
                ) : null}
                <div>
                  <h2 className="text-xl font-semibold text-white">{activeCompany.name}</h2>
                  <p className="text-xs text-violet-300/70">Add people by email. Pending invites join on signup.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveCompanyId(null);
                  setInviteEmail("");
                }}
                className="rounded-lg border border-violet-500/30 px-3 py-1.5 text-sm text-violet-200 hover:bg-violet-500/10"
              >
                Close
              </button>
            </div>

            <div className="mb-6 rounded-xl border border-violet-500/20 bg-[#221830]/60 p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-violet-300/90">Add person</h3>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email@company.com"
                  className="rounded-lg border border-violet-500/30 bg-[#161022] px-3 py-2 text-sm text-white"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value === "admin" ? "admin" : "member")}
                  className="rounded-lg border border-violet-500/30 bg-[#161022] px-3 py-2 text-sm text-white"
                >
                  <option value="member">Normal account</option>
                  <option value="admin">Company admin</option>
                </select>
                <button
                  type="button"
                  onClick={() => void addMember()}
                  disabled={saving}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>

            {detailLoading ? (
              <p className="text-sm text-violet-200/70">Loading members…</p>
            ) : (
              <>
                <div className="mb-6">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-violet-300/90">
                    Members ({detail?.members.length || 0})
                  </h3>
                  {detail?.members.length ? (
                    <div className="space-y-2">
                      {detail.members.map((member) => (
                        <div
                          key={member.user_id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-500/15 bg-[#221830]/50 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-violet-100">
                              {member.display_name || member.email || member.user_id}
                            </p>
                            <p className="truncate text-xs text-violet-300/70">{member.email || member.user_id}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={member.role}
                              onChange={(e) =>
                                void updateMemberRole(member.user_id, e.target.value === "admin" ? "admin" : "member")
                              }
                              disabled={saving}
                              className="rounded-lg border border-violet-500/30 bg-[#161022] px-2 py-1.5 text-xs text-white"
                            >
                              <option value="member">Normal</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => void removeMember(member.user_id)}
                              disabled={saving}
                              className="rounded-lg border border-red-400/30 px-2 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-violet-200/70">No members yet.</p>
                  )}
                </div>

                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-violet-300/90">
                    Pending invites ({detail?.pending_invites.length || 0})
                  </h3>
                  {detail?.pending_invites.length ? (
                    <div className="space-y-2">
                      {detail.pending_invites.map((invite) => (
                        <div
                          key={invite.email}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-500/5 px-3 py-2"
                        >
                          <div>
                            <p className="text-sm text-amber-100">{invite.email}</p>
                            <p className="text-xs text-amber-200/70">
                              Joins on signup · {invite.role === "admin" ? "admin" : "normal account"}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void removePendingInvite(invite.email)}
                            disabled={saving}
                            className="rounded-lg border border-amber-400/30 px-2 py-1.5 text-xs text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-violet-200/70">No pending invites.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
