"use client";

import { getFirebaseAuth, getFirebaseDb, getGoogleProvider } from "@/lib/firebaseClient";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

function maskUid(uid: string) {
  if (!uid) return "—";
  return `${uid.slice(0, 6)}...${uid.slice(-6)}`;
}

export function AccountClient({ extensionMode = false }: { extensionMode?: boolean }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [idTokenPreview, setIdTokenPreview] = useState("");

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setLoading(false);
      if (!nextUser) {
        setIdTokenPreview("");
        return;
      }
      try {
        const token = await nextUser.getIdToken();
        setIdTokenPreview(`${token.slice(0, 18)}...${token.slice(-18)}`);
      } catch {
        setIdTokenPreview("Unavailable");
      }
    });
    return () => unsub();
  }, []);

  const accountStatus = useMemo(() => {
    if (!user) return "Not signed in";
    return user.emailVerified ? "Signed in (verified)" : "Signed in (email not verified)";
  }, [user]);

  async function syncUserToFirestore(currentUser: User) {
    const db = getFirebaseDb();
    const ref = doc(db, "users", currentUser.uid);
    await setDoc(
      ref,
      {
        uid: currentUser.uid,
        email: currentUser.email || null,
        displayName: currentUser.displayName || null,
        photoURL: currentUser.photoURL || null,
        provider: "google",
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        // plan placeholders for next phase:
        plan: "free",
        dailyTokenLimit: 4_000_000
      },
      { merge: true }
    );
  }

  async function handleGoogleSignIn() {
    setError("");
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const result = await signInWithPopup(auth, getGoogleProvider());
      await syncUserToFirestore(result.user);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setError("");
    setBusy(true);
    try {
      await signOut(getFirebaseAuth());
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="rounded-2xl border border-violet-500/20 bg-[#221830]/70 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
        <h1 className="text-2xl font-semibold text-white">{extensionMode ? "Promptly Extension Login" : "My Promptly Account"}</h1>
        <p className="mt-2 text-sm text-violet-200/75">
          Sign in with Google to create/manage your Promptly account. This account will be used for plan limits,
          billing, and usage tracking.
        </p>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!user ? (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={busy || loading}
              className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60"
            >
              {busy ? "Signing in..." : "Sign in with Google"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSignOut}
              disabled={busy}
              className="rounded-xl border border-violet-500/40 px-4 py-2.5 text-sm text-violet-100 hover:bg-violet-500/10 disabled:opacity-60"
            >
              {busy ? "Signing out..." : "Sign out"}
            </button>
          )}

          {extensionMode ? (
            <a
              href="/account"
              className="rounded-xl border border-violet-500/30 px-4 py-2.5 text-sm text-violet-200 hover:bg-violet-500/10"
            >
              Go to full account page
            </a>
          ) : null}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-violet-500/20 bg-[#181125]/70 p-4">
            <p className="text-xs uppercase tracking-wider text-violet-300/80">Status</p>
            <p className="mt-2 text-sm text-violet-100">{loading ? "Loading..." : accountStatus}</p>
          </div>
          <div className="rounded-xl border border-violet-500/20 bg-[#181125]/70 p-4">
            <p className="text-xs uppercase tracking-wider text-violet-300/80">Email</p>
            <p className="mt-2 text-sm text-violet-100">{user?.email || "—"}</p>
          </div>
          <div className="rounded-xl border border-violet-500/20 bg-[#181125]/70 p-4">
            <p className="text-xs uppercase tracking-wider text-violet-300/80">User ID</p>
            <p className="mt-2 font-mono text-xs text-violet-100">{user ? maskUid(user.uid) : "—"}</p>
          </div>
          <div className="rounded-xl border border-violet-500/20 bg-[#181125]/70 p-4">
            <p className="text-xs uppercase tracking-wider text-violet-300/80">ID Token Preview</p>
            <p className="mt-2 font-mono text-[11px] text-violet-100">{idTokenPreview || "—"}</p>
          </div>
        </div>

        {extensionMode ? (
          <div className="mt-5 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
            The extension now uses the same Firebase project for auth and backend access. Keep your Firebase Web API
            key and auth domain in extension settings so requests can authenticate cleanly.
          </div>
        ) : null}
      </div>
    </main>
  );
}
