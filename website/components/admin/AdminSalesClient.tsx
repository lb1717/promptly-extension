"use client";

import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type SalesLink = {
  id: string;
  slug: string;
  recipientName: string;
  tier: "pro" | "student" | "enterprise";
  offerTitle: string;
  offerDescription: string;
  stripePromotionCodeId: string | null;
  stripePromotionCodeLabel: string | null;
  internalNote: string | null;
  active: boolean;
  signupCount: number;
  createdAt: string | null;
};

const TIERS = [
  { value: "enterprise", label: "Enterprise ($70/mo)" },
  { value: "pro", label: "Pro ($2.99/mo)" },
  { value: "student", label: "Student ($1.49/mo)" }
] as const;

function tierLabel(tier: string) {
  if (tier === "enterprise") return "Enterprise";
  if (tier === "pro") return "Pro";
  if (tier === "student") return "Student";
  return tier;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

export function AdminSalesClient() {
  const [links, setLinks] = useState<SalesLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState("");

  const [recipientName, setRecipientName] = useState("");
  const [slug, setSlug] = useState("");
  const [tier, setTier] = useState<(typeof TIERS)[number]["value"]>("enterprise");
  const [offerTitle, setOfferTitle] = useState("");
  const [offerDescription, setOfferDescription] = useState("");
  const [promoId, setPromoId] = useState("");
  const [promoLabel, setPromoLabel] = useState("");
  const [internalNote, setInternalNote] = useState("");

  const origin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/sales-links", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load sales links.");
        return;
      }
      setLinks(Array.isArray(data.links) ? data.links : []);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setRecipientName("");
    setSlug("");
    setTier("enterprise");
    setOfferTitle("");
    setOfferDescription("");
    setPromoId("");
    setPromoLabel("");
    setInternalNote("");
  }

  async function createLink() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/admin/sales-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient_name: recipientName,
          slug: slug.trim() || null,
          tier,
          offer_title: offerTitle,
          offer_description: offerDescription,
          stripe_promotion_code_id: promoId.trim() || null,
          stripe_promotion_code_label: promoLabel.trim() || null,
          internal_note: internalNote.trim() || null
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create link.");
        return;
      }
      setMessage(`Created invite link for ${data.link?.recipientName || recipientName}.`);
      resetForm();
      setShowForm(false);
      await load();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(link: SalesLink) {
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/sales-links/${encodeURIComponent(link.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !link.active })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update link.");
        return;
      }
      await load();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  async function copyUrl(linkSlug: string) {
    const url = `${origin}/join/${linkSlug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSlug(linkSlug);
      window.setTimeout(() => setCopiedSlug(""), 2000);
    } catch {
      setError("Could not copy link to clipboard.");
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/admin" className="text-xs text-violet-300/80 hover:text-white">
            ← Admin dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-white">Sales invite links</h1>
          <p className="mt-1 max-w-2xl text-sm text-violet-200/70">
            Create personalized signup links with a welcome message, fixed plan, and auto-applied Stripe promo codes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setShowForm((prev) => !prev);
              setMessage("");
              setError("");
            }}
            className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500"
          >
            {showForm ? "Cancel" : "Create invite link"}
          </button>
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

      {showForm ? (
        <section className="mb-8 rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-300/90">New invite link</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-violet-200/80">Recipient name (shown on welcome step)</span>
              <input
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Acme Corp or Jane Smith"
                className="w-full rounded-lg border border-violet-500/25 bg-[#1a1228] px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-violet-200/80">Custom URL slug (optional)</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="acme-corp"
                className="w-full rounded-lg border border-violet-500/25 bg-[#1a1228] px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-violet-200/80">Plan to offer</span>
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value as (typeof TIERS)[number]["value"])}
                className="w-full rounded-lg border border-violet-500/25 bg-[#1a1228] px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
              >
                {TIERS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-violet-200/80">Offer headline (shown above plan card)</span>
              <input
                value={offerTitle}
                onChange={(e) => setOfferTitle(e.target.value)}
                placeholder="Enterprise — complimentary for 90 days"
                className="w-full rounded-lg border border-violet-500/25 bg-[#1a1228] px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-violet-200/80">Offer description</span>
              <textarea
                value={offerDescription}
                onChange={(e) => setOfferDescription(e.target.value)}
                rows={3}
                placeholder="We've set you up with full Enterprise access at no charge for your first three months."
                className="w-full rounded-lg border border-violet-500/25 bg-[#1a1228] px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-violet-200/80">Stripe promotion code ID</span>
              <input
                value={promoId}
                onChange={(e) => setPromoId(e.target.value)}
                placeholder="promo_..."
                className="w-full rounded-lg border border-violet-500/25 bg-[#1a1228] px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
              />
              <span className="mt-1 block text-xs text-violet-300/60">
                From Stripe Dashboard → Product catalog → Coupons → Promotion codes. Auto-applied at checkout.
              </span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-violet-200/80">Promo label (internal reference)</span>
              <input
                value={promoLabel}
                onChange={(e) => setPromoLabel(e.target.value)}
                placeholder="ACME-90FREE"
                className="w-full rounded-lg border border-violet-500/25 bg-[#1a1228] px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-violet-200/80">Internal note (optional)</span>
              <input
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                placeholder="Met at conference, follow up in Q2"
                className="w-full rounded-lg border border-violet-500/25 bg-[#1a1228] px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
              />
            </label>
          </div>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={createLink}
              disabled={saving}
              className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60"
            >
              {saving ? "Creating…" : "Create link"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-violet-500/20 bg-[#221830]/60 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-violet-300/90">Active links</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-violet-500/20 text-xs uppercase tracking-wider text-violet-300/80">
                <th className="py-2 pr-4">Recipient</th>
                <th className="py-2 pr-4">Plan</th>
                <th className="py-2 pr-4">Offer</th>
                <th className="py-2 pr-4">Promo</th>
                <th className="py-2 pr-4">Signups</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-0">Link</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id} className="border-b border-violet-500/10 text-violet-100/90">
                  <td className="py-3 pr-4">
                    <div className="font-medium text-white">{link.recipientName}</div>
                    <div className="text-xs text-violet-300/60">{formatDate(link.createdAt)}</div>
                  </td>
                  <td className="py-3 pr-4">{tierLabel(link.tier)}</td>
                  <td className="max-w-[220px] py-3 pr-4">
                    <div className="truncate font-medium">{link.offerTitle}</div>
                    <div className="truncate text-xs text-violet-300/60">{link.offerDescription}</div>
                  </td>
                  <td className="py-3 pr-4 text-xs font-mono">
                    {link.stripePromotionCodeLabel || link.stripePromotionCodeId || "—"}
                  </td>
                  <td className="py-3 pr-4">{link.signupCount}</td>
                  <td className="py-3 pr-4">
                    <button
                      type="button"
                      onClick={() => toggleActive(link)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        link.active
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-neutral-500/20 text-neutral-300"
                      }`}
                    >
                      {link.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="py-3 pr-0">
                    <button
                      type="button"
                      onClick={() => copyUrl(link.slug)}
                      className="rounded-lg border border-violet-500/30 px-3 py-1.5 text-xs font-semibold text-violet-100 hover:bg-violet-500/15"
                    >
                      {copiedSlug === link.slug ? "Copied!" : "Copy link"}
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && links.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-violet-200/70">
                    No invite links yet. Create one to get started.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-violet-500/15 bg-[#221830]/40 p-5 text-sm text-violet-200/75">
        <h3 className="font-semibold text-violet-100">How it works</h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          <li>Create a coupon and promotion code in Stripe (e.g. 100% off for 3 months).</li>
          <li>Create an invite link here with the recipient name, plan, offer copy, and Stripe promo ID.</li>
          <li>Send the link — recipients see a 4-step flow: welcome → account → plan → install extension.</li>
          <li>When they activate the plan, Stripe Checkout opens with your promo code already applied.</li>
        </ol>
      </section>
    </main>
  );
}
