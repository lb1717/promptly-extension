"use client";

import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Company = {
  id: string;
  name: string;
  logo_url: string | null;
};

type AdminUser = {
  user_id: string;
  email?: string | null;
  company_id?: string | null;
  company_role?: "admin" | "member" | null;
  company_name?: string | null;
};

export function AdminCompaniesClient() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyLogo, setNewCompanyLogo] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { company_id: string; company_role: "admin" | "member" }>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [companiesRes, usersRes] = await Promise.all([
        fetch("/api/admin/companies", { cache: "no-store" }),
        fetch("/api/admin/users?days=30", { cache: "no-store" })
      ]);
      const [companiesJson, usersJson] = await Promise.all([
        companiesRes.json().catch(() => ({})),
        usersRes.json().catch(() => ({}))
      ]);
      if (!companiesRes.ok || !usersRes.ok) {
        throw new Error(companiesJson.error || usersJson.error || "Failed to load companies");
      }
      const nextCompanies = companiesJson.companies || [];
      const nextUsers = usersJson.users || [];
      setCompanies(nextCompanies);
      setUsers(nextUsers);
      setDrafts(
        Object.fromEntries(
          nextUsers.map((user: AdminUser) => [
            user.user_id,
            {
              company_id: user.company_id || "",
              company_role: user.company_role === "admin" ? "admin" : "member"
            }
          ])
        )
      );
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      await load();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  async function saveUser(userId: string) {
    const draft = drafts[userId] || { company_id: "", company_role: "member" as const };
    setSavingUserId(userId);
    setMessage("");
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: draft.company_id || null,
          company_role: draft.company_role
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not update user");
      setMessage(draft.company_id ? "User company membership saved." : "User removed from company.");
      await load();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/admin" className="text-sm text-violet-300 hover:text-white">
            ← Admin dashboard
          </Link>
          <h1 className="mt-3 text-2xl font-semibold text-white">Companies</h1>
          <p className="mt-1 text-sm text-violet-200/70">
            Create firm accounts and manage which existing users are admins or normal members.
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
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
          >
            Create
          </button>
        </div>
      </section>

      <section className="mb-8 rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-violet-300/90">Company list</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <article key={company.id} className="rounded-xl border border-violet-500/20 bg-[#161022] p-4">
              <div className="flex items-center gap-3">
                {company.logo_url ? <img src={company.logo_url} alt="" className="h-10 w-10 rounded-lg object-contain" /> : null}
                <div className="min-w-0">
                  <p className="truncate font-semibold text-violet-100">{company.name}</p>
                  <p className="mt-1 font-mono text-[10px] text-violet-300/70">{company.id}</p>
                </div>
              </div>
            </article>
          ))}
          {!loading && !companies.length ? <p className="text-sm text-violet-200/70">No companies yet.</p> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-violet-300/90">Assign existing users</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-violet-500/20 text-xs uppercase tracking-wider text-violet-300/80">
                <th className="py-2 pr-4">User</th>
                <th className="py-2 pr-4">Company</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-0">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const draft = drafts[user.user_id] || { company_id: "", company_role: "member" as const };
                return (
                  <tr key={user.user_id} className="border-b border-violet-500/10 text-violet-100/90">
                    <td className="py-2 pr-4">
                      <Link href={`/admin/users/${encodeURIComponent(user.user_id)}`} className="text-violet-300 underline-offset-2 hover:underline">
                        {user.email || user.user_id}
                      </Link>
                      {user.company_name ? <p className="text-[10px] text-violet-300/70">Current: {user.company_name}</p> : null}
                    </td>
                    <td className="py-2 pr-4">
                      <select
                        value={draft.company_id}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [user.user_id]: { ...draft, company_id: e.target.value }
                          }))
                        }
                        className="min-w-[12rem] rounded-lg border border-violet-500/30 bg-[#161022] px-3 py-2 text-xs text-white"
                      >
                        <option value="">No company</option>
                        {companies.map((company) => (
                          <option key={company.id} value={company.id}>
                            {company.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-4">
                      <select
                        value={draft.company_role}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [user.user_id]: {
                              ...draft,
                              company_role: e.target.value === "admin" ? "admin" : "member"
                            }
                          }))
                        }
                        className="rounded-lg border border-violet-500/30 bg-[#161022] px-3 py-2 text-xs text-white"
                      >
                        <option value="member">Normal account</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="py-2 pr-0">
                      <button
                        type="button"
                        onClick={() => saveUser(user.user_id)}
                        disabled={savingUserId === user.user_id}
                        className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                      >
                        {savingUserId === user.user_id ? "Saving…" : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loading && !users.length ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-violet-200/70">
                    No users yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
