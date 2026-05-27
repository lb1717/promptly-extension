"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { getFirebaseAuth } from "@/lib/firebaseClient";
import {
  preflightEmailRegistration,
  resolveEmailRegistrationError,
  resolveEmailSignInError,
  type AuthProviderHint
} from "@/lib/firebaseAuthAccountHints";
import { sendPromptlyExtensionMessage } from "@/lib/extensionBridge";

type Props = {
  apiKey: string;
  extensionId: string;
  signinCsrf: string;
  disabled: boolean;
};

async function identitySignInWithPassword(apiKey: string, email: string, password: string) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true, email: email.trim(), password })
    }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(body?.error?.message || body?.error || "Sign-in failed"));
  }
  return body as {
    idToken: string;
    refreshToken: string;
    email: string;
    localId: string;
    expiresIn: string;
  };
}

async function identitySignUp(apiKey: string, email: string, password: string) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true, email: email.trim(), password })
    }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(body?.error?.message || body?.error || "Could not create account"));
  }
  return body as {
    idToken: string;
    refreshToken: string;
    email: string;
    localId: string;
    expiresIn: string;
  };
}

async function identityUpdateProfile(apiKey: string, idToken: string, displayName: string) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken: idToken.trim(),
        displayName: displayName.trim(),
        returnSecureToken: true
      })
    }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(body?.error?.message || body?.error || "Could not save profile name"));
  }
}

async function identitySendPasswordReset(apiKey: string, email: string) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestType: "PASSWORD_RESET",
        email: email.trim()
      })
    }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(body?.error?.message || body?.error || "Could not send reset email"));
  }
}

async function identitySendVerifyEmail(apiKey: string, idToken: string) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestType: "VERIFY_EMAIL",
        idToken: idToken.trim()
      })
    }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(body?.error?.message || body?.error || "Could not send verification email"));
  }
}

async function identityLookup(apiKey: string, idToken: string) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: idToken.trim() })
    }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(body?.error?.message || body?.error || "Could not verify account state"));
  }
  const firstUser = Array.isArray(body?.users) ? body.users[0] : null;
  return {
    emailVerified: !!firstUser?.emailVerified
  };
}

function sendSessionToExtension(
  extensionId: string,
  payload: {
    signin_csrf: string;
    idToken: string;
    refreshToken: string;
    email: string;
    uid: string;
    expiresAtSec: number;
  }
) {
  return sendPromptlyExtensionMessage(extensionId, {
    type: "PROMPTLY_FIREBASE_EMAIL_SESSION",
    ...payload
  }).then((response) => {
    const r = response as { ok?: boolean; error?: string } | undefined;
    if (r && r.ok === false) {
      throw new Error(String(r.error || "Extension rejected sign-in"));
    }
  });
}

export function ExtensionEmailAuthPanel({ apiKey, extensionId, signinCsrf, disabled }: Props) {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [authProviderHint, setAuthProviderHint] = useState<AuthProviderHint>(null);

  function showGuidance(message: string, hint: AuthProviderHint) {
    setError("");
    setMessage(message);
    setAuthProviderHint(hint);
    if (hint === "use-email") {
      setMode("signin");
    }
  }

  async function onSubmitSignIn(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setAuthProviderHint(null);
    setNeedsEmailVerification(false);
    if (disabled || !apiKey || !extensionId || !signinCsrf) return;
    setBusy(true);
    try {
      const body = await identitySignInWithPassword(apiKey, email, password);
      const lookup = await identityLookup(apiKey, body.idToken);
      if (!lookup.emailVerified) {
        await identitySendVerifyEmail(apiKey, body.idToken);
        setNeedsEmailVerification(true);
        setMessage("Verify your email to finish sign-in. We sent a verification link.");
        return;
      }
      const nowSec = Math.floor(Date.now() / 1000);
      const expiresIn = Math.max(300, Number(body.expiresIn) || 3600);
      await sendSessionToExtension(extensionId, {
        signin_csrf: signinCsrf,
        idToken: body.idToken,
        refreshToken: body.refreshToken,
        email: String(body.email || email).trim().toLowerCase(),
        uid: String(body.localId || "").trim(),
        expiresAtSec: nowSec + expiresIn
      });
      setMessage("Signed in. You can close this window.");
      try {
        window.close();
      } catch {
        /* ignore */
      }
    } catch (err) {
      const resolved = await resolveEmailSignInError(getFirebaseAuth(), email, err);
      if (resolved.hint) {
        showGuidance(resolved.message, resolved.hint);
      } else {
        setError(resolved.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitRegister(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setAuthProviderHint(null);
    setNeedsEmailVerification(false);
    if (disabled || !apiKey || !extensionId || !signinCsrf) return;
    if (password !== password2) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter your name.");
      return;
    }
    setBusy(true);
    try {
      const preflight = await preflightEmailRegistration(getFirebaseAuth(), email);
      if (preflight?.blocked) {
        showGuidance(preflight.message, preflight.hint);
        return;
      }
      const body = await identitySignUp(apiKey, email, password);
      await identityUpdateProfile(apiKey, body.idToken, trimmedName);
      await identitySendVerifyEmail(apiKey, body.idToken);
      setNeedsEmailVerification(true);
      setMode("signin");
      setPassword("");
      setPassword2("");
      setName("");
      setMessage("Account created. Verify your email first, then sign in.");
    } catch (err) {
      const resolved = await resolveEmailRegistrationError(getFirebaseAuth(), email, err);
      if (resolved.hint) {
        showGuidance(resolved.message, resolved.hint);
      } else {
        setError(resolved.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onForgotPassword() {
    setError("");
    setMessage("");
    if (disabled || !apiKey) return;
    const em = email.trim();
    if (!em) {
      setError("Enter your email above first.");
      return;
    }
    setBusy(true);
    try {
      await identitySendPasswordReset(apiKey, em);
      setMessage("If an account exists for that email, a reset link was sent.");
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full rounded-xl border border-line bg-cream p-5">
      <h2 className="text-center text-base font-semibold text-ink">
        {mode === "signin" ? "Sign in with Email" : "Create account with Email"}
      </h2>
      <div className="mt-4 flex justify-center gap-2 text-xs">
        <button
          type="button"
          className={`rounded-lg px-2 py-1 ${mode === "signin" ? "bg-cream-dark text-ink" : "text-faint hover:text-ink"}`}
          onClick={() => {
            setMode("signin");
            setError("");
            setMessage("");
            setNeedsEmailVerification(false);
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`rounded-lg px-2 py-1 ${mode === "register" ? "bg-cream-dark text-ink" : "text-faint hover:text-ink"}`}
          onClick={() => {
            setMode("register");
            setError("");
            setMessage("");
            setNeedsEmailVerification(false);
          }}
        >
          Create account
        </button>
      </div>
      <form onSubmit={mode === "signin" ? onSubmitSignIn : onSubmitRegister} className="mt-4 space-y-2">
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          disabled={disabled || busy}
          placeholder="Email"
          className="w-full rounded-lg border border-line bg-cream-dark px-3 py-2 text-sm text-ink placeholder:text-faint/40 outline-none focus:border-line"
        />
        {mode === "register" ? (
          <input
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            disabled={disabled || busy}
            placeholder="Full name"
            className="w-full rounded-lg border border-line bg-cream-dark px-3 py-2 text-sm text-ink placeholder:text-faint/40 outline-none focus:border-line"
          />
        ) : null}
        <input
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
          disabled={disabled || busy}
          placeholder="Password"
          className="w-full rounded-lg border border-line bg-cream-dark px-3 py-2 text-sm text-ink placeholder:text-faint/40 outline-none focus:border-line"
        />
        {mode === "register" ? (
          <input
            type="password"
            autoComplete="new-password"
            required
            value={password2}
            onChange={(ev) => setPassword2(ev.target.value)}
            disabled={disabled || busy}
            placeholder="Confirm password"
            className="w-full rounded-lg border border-line bg-cream-dark px-3 py-2 text-sm text-ink placeholder:text-faint/40 outline-none focus:border-line"
          />
        ) : null}
        <button
          type="submit"
          disabled={disabled || busy}
          className="w-full rounded-lg bg-cream-dark py-2 text-sm font-semibold text-ink hover:bg-cream-deep disabled:opacity-60"
        >
          {busy ? "Working…" : mode === "signin" ? "Sign in with email" : "Create account"}
        </button>
        {mode === "signin" ? (
          <button
            type="button"
            onClick={onForgotPassword}
            disabled={disabled || busy}
            className="w-full text-center text-[11px] text-faint hover:text-ink disabled:opacity-60"
          >
            Forgot password?
          </button>
        ) : null}
      </form>
      {mode === "signin" && needsEmailVerification ? (
        <p className="mt-2 text-center text-[11px] leading-snug text-muted">
          Email must be verified before this account can be used.
        </p>
      ) : null}
      {error ? (
        <div className="mt-4 w-full rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {message ? (
        <div
          className={`mt-4 w-full rounded-xl border px-4 py-3 text-sm ${
            authProviderHint
              ? "border-amber-500/30 bg-amber-500/10 text-amber-900"
              : "border-emerald-500/25 bg-emerald-500/10 text-emerald-800"
          }`}
        >
          {message}
          {authProviderHint === "use-google" ? (
            <p className="mt-2 text-[11px] leading-snug opacity-90">
              Close this email form and use the Google button above on the sign-in page.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
