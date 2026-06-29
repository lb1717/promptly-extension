"use client";

import { getFirebaseAuth } from "@/lib/firebaseClient";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useCallback, useEffect, useState } from "react";

type CompanionAdoptionState = {
  loading: boolean;
  showPromo: boolean;
  adopted: boolean | null;
};

export function useCompanionAdoptionPromo(): CompanionAdoptionState {
  const [user, setUser] = useState<User | null>(null);
  const [adopted, setAdopted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (currentUser: User | null) => {
    if (!currentUser) {
      setAdopted(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch("/api/account/companion-adoption", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAdopted(Boolean(data.adopted));
      } else {
        setAdopted(null);
      }
    } catch {
      setAdopted(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      void refresh(nextUser);
    });
  }, [refresh]);

  useEffect(() => {
    if (!user || adopted) return;
    const onFocus = () => void refresh(user);
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => void refresh(user), 30000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [adopted, refresh, user]);

  return {
    loading,
    adopted,
    showPromo: Boolean(user && adopted === false)
  };
}
