"use client";

import { InstallMoreIntegrationsClient } from "@/components/account/InstallMoreIntegrationsClient";
import { getFirebaseAuth } from "@/lib/firebaseClient";
import { onAuthStateChanged, type User } from "firebase/auth";
import Link from "next/link";
import { useEffect, useState } from "react";

export function AccountIntegrationsGate({ mode }: { mode: "install" }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) {
    return <p className="px-6 py-16 text-center text-sm text-muted">Loading…</p>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <p className="text-sm text-muted">Sign in to install integrations.</p>
        <Link
          href="/account"
          className="mt-4 inline-flex rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream hover:bg-neutral-800"
        >
          Go to account
        </Link>
      </div>
    );
  }

  if (mode === "install") {
    return <InstallMoreIntegrationsClient user={user} />;
  }

  return null;
}
