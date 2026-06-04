"use client";

import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";
import { AdminSalesClient } from "@/components/admin/AdminSalesClient";
import { AdminSalesTeamClient } from "@/components/admin/AdminSalesTeamClient";
import Link from "next/link";
import { useState } from "react";

type Tab = "personalized" | "team";

export function AdminSalesTabs() {
  const [tab, setTab] = useState<Tab>("team");

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/admin" className="text-xs text-violet-300/80 hover:text-white">
            ← Admin dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-white">Sales</h1>
        </div>
        <AdminLogoutButton />
      </div>

      <div className="mb-8 flex gap-2 rounded-xl border border-violet-500/20 bg-[#1a1228]/80 p-1">
        <button
          type="button"
          onClick={() => setTab("team")}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
            tab === "team"
              ? "bg-violet-600 text-white"
              : "text-violet-200/80 hover:bg-violet-500/10 hover:text-white"
          }`}
        >
          Sales team links
        </button>
        <button
          type="button"
          onClick={() => setTab("personalized")}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
            tab === "personalized"
              ? "bg-violet-600 text-white"
              : "text-violet-200/80 hover:bg-violet-500/10 hover:text-white"
          }`}
        >
          Personalized invites
        </button>
      </div>

      {tab === "team" ? <AdminSalesTeamClient /> : <AdminSalesClient embedded />}
    </main>
  );
}
